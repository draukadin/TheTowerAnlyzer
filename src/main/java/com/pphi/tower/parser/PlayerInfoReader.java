package com.pphi.tower.parser;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.*;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.zip.GZIPInputStream;

/**
 * Reads playerInfo.dat — a gzip-compressed .NET BinaryFormatter (MS-NRBF) save file
 * from "The Tower" (Unity/C#). Extracts all primitive and string fields from the
 * root SaveLoad+PlayerData class and returns them as a flat Map&lt;String, Object&gt;.
 *
 * <p>Value types in the map:
 * <ul>
 *   <li>Boolean → {@code Boolean}
 *   <li>Int16   → {@code Short}
 *   <li>Int32   → {@code Integer}
 *   <li>Int64   → {@code Long}
 *   <li>UInt16  → {@code Integer}
 *   <li>UInt32  → {@code Long}
 *   <li>UInt64  → {@code BigInteger} (unsigned, in [0, 2^64))
 *   <li>Single  → {@code Float}
 *   <li>Double  → {@code Double}
 *   <li>TimeSpan / DateTime → {@code Long} (100-ns ticks)
 *   <li>String  → {@code String}
 *   <li>Primitive arrays → the corresponding Java primitive array type
 *   <li>Complex / reference types that were forward-referenced → {@code null}
 * </ul>
 */
@Component
public class PlayerInfoReader {

    // ── NRBF record-type constants ────────────────────────────────────────────
    private static final int RT_CLASS_WITH_ID                      = 1;
    private static final int RT_SYSTEM_CLASS_WITH_MEMBERS_AND_TYPES = 4;
    private static final int RT_CLASS_WITH_MEMBERS_AND_TYPES       = 5;
    private static final int RT_BINARY_OBJECT_STRING               = 6;
    private static final int RT_BINARY_ARRAY                       = 7;
    private static final int RT_MEMBER_PRIMITIVE_TYPED             = 8;
    private static final int RT_MEMBER_REFERENCE                   = 9;
    private static final int RT_OBJECT_NULL                        = 10;
    private static final int RT_MESSAGE_END                        = 11;
    private static final int RT_BINARY_LIBRARY                     = 12;
    private static final int RT_OBJECT_NULL_MULTIPLE_256           = 13;
    private static final int RT_OBJECT_NULL_MULTIPLE               = 14;
    private static final int RT_ARRAY_SINGLE_PRIMITIVE             = 15;
    private static final int RT_ARRAY_SINGLE_OBJECT                = 16;
    private static final int RT_ARRAY_SINGLE_STRING                = 17;

    // ── BinaryTypeEnum constants ──────────────────────────────────────────────
    private static final int BTE_PRIMITIVE       = 0;
    private static final int BTE_STRING          = 1;
    private static final int BTE_SYSTEM_CLASS    = 3;
    private static final int BTE_CLASS           = 4;
    private static final int BTE_PRIMITIVE_ARRAY = 7;

    // ── PrimitiveTypeEnum constants ───────────────────────────────────────────
    private static final int PTE_BOOLEAN  = 1;
    private static final int PTE_BYTE     = 2;
    private static final int PTE_CHAR     = 3;
    private static final int PTE_DECIMAL  = 5;
    private static final int PTE_DOUBLE   = 6;
    private static final int PTE_INT16    = 7;
    private static final int PTE_INT32    = 8;
    private static final int PTE_INT64    = 9;
    private static final int PTE_SBYTE    = 10;
    private static final int PTE_SINGLE   = 11;
    private static final int PTE_TIMESPAN = 12;
    private static final int PTE_DATETIME = 13;
    private static final int PTE_UINT16   = 14;
    private static final int PTE_UINT32   = 15;
    private static final int PTE_UINT64   = 16;

    private final DiagnosticLogger logger;

    public PlayerInfoReader(@Value("${tower.parser.diagnostics-enabled:false}") boolean enabled) {
        logger = new DiagnosticLogger(enabled);
    }

    // ─────────────────────────────────────────────────────────────────────────

    private record ClassInfo(int objectId, String[] memberNames, int[] bte, int[] ai) {}

    /**
     * Parses the given .dat file and returns all player-data fields.
     *
     * @param path path to playerInfo.dat
     * @return unmodifiable map of fieldName → value
     */
    public Map<String, Object> read(Path path) throws IOException {
        return read(Files.readAllBytes(path));
    }

    /**
     * Parses gzip-compressed playerInfo.dat bytes and returns all player-data fields.
     *
     * @param raw gzip-compressed playerInfo.dat contents
     * @return unmodifiable map of fieldName → value
     */
    public Map<String, Object> read(byte[] raw) throws IOException {
        byte[] decompressed;
        try (GZIPInputStream gz = new GZIPInputStream(new ByteArrayInputStream(raw))) {
            decompressed = gz.readAllBytes();
        }
        return parse(new NrbfStream(decompressed));
    }

    // ── Top-level NRBF parse ──────────────────────────────────────────────────

    private Map<String, Object> parse(NrbfStream s) throws IOException {
        Map<Integer, ClassInfo> classDefs  = new HashMap<>();
        Map<Integer, Object>    objectStore = new HashMap<>();
        Map<String, Object>     result     = new LinkedHashMap<>();
        // Root members that were serialized as MemberReferences (memberName → objectId).
        // .NET BinaryFormatter writes referenced objects (e.g. per-tier arrays) as their
        // own top-level records that may appear *after* the root object that points at
        // them, so these ids cannot be resolved at read time. They are resolved in a
        // second pass below, once the whole stream has been walked and objectStore is
        // fully populated.
        Map<String, Integer>    pendingRefs = new LinkedHashMap<>();

        s.skip(17); // SerializationHeaderRecord (type + 4×Int32)

        boolean rootRead = false;

        outer:
        while (true) {
            int rt = s.readByte();
            switch (rt) {
                case RT_CLASS_WITH_MEMBERS_AND_TYPES -> {
                    ClassInfo cls = readClassDef(s);
                    classDefs.put(cls.objectId(), cls);
                    if (!rootRead) {
                        readRootValues(s, cls, classDefs, objectStore, result, pendingRefs);
                        rootRead = true;
                    } else {
                        skipClassValues(s, cls, classDefs, objectStore);
                    }
                }
                case RT_SYSTEM_CLASS_WITH_MEMBERS_AND_TYPES -> {
                    ClassInfo cls = readSystemClassDef(s);
                    classDefs.put(cls.objectId(), cls);
                    skipClassValues(s, cls, classDefs, objectStore);
                }
                case RT_CLASS_WITH_ID -> {
                    int id     = s.readInt32();
                    int metaId = s.readInt32();
                    ClassInfo cls = classDefs.get(metaId);
                    if (cls != null) {
                        ClassInfo inst = new ClassInfo(id, cls.memberNames(), cls.bte(), cls.ai());
                        classDefs.put(id, inst);
                        skipClassValues(s, inst, classDefs, objectStore);
                    }
                }
                case RT_BINARY_OBJECT_STRING -> {
                    int id  = s.readInt32();
                    String v = s.readLPString();
                    objectStore.put(id, v);
                }
                case RT_BINARY_ARRAY          -> skipBinaryArray(s, classDefs, objectStore);
                case RT_MEMBER_REFERENCE      -> s.skip(4);
                case RT_OBJECT_NULL           -> { /* nothing */ }
                case RT_MESSAGE_END           -> { break outer; }
                case RT_BINARY_LIBRARY        -> { s.skip(4); s.readLPString(); }
                case RT_OBJECT_NULL_MULTIPLE_256 -> s.skip(1);
                case RT_OBJECT_NULL_MULTIPLE  -> s.skip(4);
                case RT_ARRAY_SINGLE_PRIMITIVE -> {
                    int id  = s.readInt32();
                    int len = s.readInt32();
                    int pte = s.readByte();
                    objectStore.put(id, readPrimArray(s, pte, len));
                }
                case RT_ARRAY_SINGLE_OBJECT  -> skipArraySingleObject(s, classDefs, objectStore);
                case RT_ARRAY_SINGLE_STRING  -> skipArraySingleString(s, classDefs, objectStore);
                default -> {
                    System.err.printf("[WARN] Unknown top-level record 0x%X at pos 0x%X, stopping%n",
                            rt, s.pos() - 1);
                    break outer;
                }
            }
        }

        // ── Second pass: resolve forward MemberReferences ─────────────────────
        // objectStore is now fully populated. Any root member that pointed at an
        // object serialized later in the stream resolves here; ids that are still
        // absent (genuinely null/uninitialised, or held in a record type we don't
        // capture by id) are left as the null placeholder already in result.
        for (Map.Entry<String, Integer> e : pendingRefs.entrySet()) {
            Object resolved = objectStore.get(e.getValue());
            if (resolved != null) result.put(e.getKey(), resolved);
        }
        return Collections.unmodifiableMap(result);
    }

    // ── Class-definition reading ──────────────────────────────────────────────

    private ClassInfo readClassDef(NrbfStream s) throws IOException {
        int    objectId    = s.readInt32();
        String className   = s.readLPString();
        int    memberCount = s.readInt32();
        if (memberCount < 0 || memberCount > 100_000)
            throw new IOException("Invalid memberCount " + memberCount
                    + " at pos 0x" + Integer.toHexString(s.pos() - 4));
        logger.printDiagnostic("readClassDef: id=%d class=%s memberCount=%d pos=0x%X%n",
                objectId, className, memberCount, s.pos());
        String[] names = readMemberNames(s, memberCount);
        logger.printDiagnostic("  after names pos=0x%X%n", s.pos());
        int[] bte = readBte(s, memberCount);
        logger.printDiagnostic("  after bte  pos=0x%X%n", s.pos());
        int[] ai  = readAi(s, bte, memberCount);
        logger.printDiagnostic("  after ai   pos=0x%X%n", s.pos());
        s.skip(4); // LibraryId
        logger.printDiagnostic("  after libId pos=0x%X (values start here)%n", s.pos());
        {
            int dumpStart = s.pos();
            byte[] dump = s.readBytes(32);
            s.skip(-32);
            logger.printDiagnostic("  [HEX] first 32 bytes at values start (0x%X): %s%n",
                    dumpStart, java.util.HexFormat.of().formatHex(dump));
        }
        return new ClassInfo(objectId, names, bte, ai);
    }

    private ClassInfo readSystemClassDef(NrbfStream s) throws IOException {
        int      objectId    = s.readInt32();
        s.readLPString();
        int      memberCount = s.readInt32();
        if (memberCount < 0 || memberCount > 100_000)
            throw new IOException("Invalid memberCount " + memberCount
                    + " at pos 0x" + Integer.toHexString(s.pos() - 4));
        String[] names       = readMemberNames(s, memberCount);
        int[]    bte         = readBte(s, memberCount);
        int[]    ai          = readAi(s, bte, memberCount);
        // No LibraryId for system classes
        return new ClassInfo(objectId, names, bte, ai);
    }

    private String[] readMemberNames(NrbfStream s, int count) throws IOException {
        String[] names = new String[count];
        for (int i = 0; i < count; i++) names[i] = s.readLPString();
        return names;
    }

    private int[] readBte(NrbfStream s, int count) throws IOException {
        int[] bte = new int[count];
        for (int i = 0; i < count; i++) {
            bte[i] = s.readByte();
            if (i < 10) {
                logger.printDiagnostic("    [BTE] member[%d] bte=%d at pos 0x%X%n", i, bte[i], s.pos() - 1);
            }
        }
        return bte;
    }

    private int[] readAi(NrbfStream s, int[] bte, int count) throws IOException {
        int[] ai = new int[count];
        for (int i = 0; i < count; i++) {
            int posBefore = s.pos();
            ai[i] = switch (bte[i]) {
                case BTE_PRIMITIVE, BTE_PRIMITIVE_ARRAY -> s.readByte();  // PrimitiveTypeEnum
                case BTE_SYSTEM_CLASS -> { String cn = s.readLPString(); if (i < 10) logger.printDiagnostic("    [AI] member[%d] SYSTEM_CLASS name=%s%n", i, cn); yield -1; } // class name string
                case BTE_CLASS        -> { String cn = s.readLPString(); s.skip(4); if (i < 10) logger.printDiagnostic("    [AI] member[%d] CLASS name=%s%n", i, cn); yield -2; } // name + libId
                default               -> -3; // String / Object / Array → no extra bytes
            };
            if (i < 10) {
                logger.printDiagnostic("    [AI] member[%d] bte=%d ai=%d posBefore=0x%X posAfter=0x%X%n", i, bte[i], ai[i], posBefore, s.pos());
            }
        }
        return ai;
    }

    // ── Value reading ─────────────────────────────────────────────────────────

    private void readRootValues(NrbfStream s, ClassInfo cls,
                                Map<Integer, ClassInfo> classDefs,
                                Map<Integer, Object>    objectStore,
                                Map<String, Object>     result,
                                Map<String, Integer>    pendingRefs) throws IOException {
        // Print BTE/AI header for first 40 members
        logger.printDiagnostic("=== Member type info (non-primitive BTE only) ===");
        for (int i = 0; i < cls.memberNames().length; i++) {
            if (cls.bte()[i] != BTE_PRIMITIVE) {
                logger.printDiagnostic("  header[%3d] bte=%-2d ai=%-3d  %s%n",
                        i, cls.bte()[i], cls.ai()[i], cls.memberNames()[i]);
            }
        }
        logger.printDiagnostic("=== Reading values ===");

        // Tracks how many *additional* upcoming members are covered by a null-run
        // record (ObjectNullMultiple / ObjectNullMultiple256) that was already
        // consumed for an earlier member. NRBF can compress several consecutive
        // null reference-type members into a single record, so this count must be
        // shared across member iterations rather than reset per-member.
        int nullRunRemaining = 0;

        for (int i = 0; i < cls.memberNames().length; i++) {
            String name = cls.memberNames()[i];
            int posBeforeRead = s.pos();
            Object val;
            try {
                if (nullRunRemaining > 0) {
                    nullRunRemaining--;
                    val = null;
                } else if (cls.bte()[i] == BTE_PRIMITIVE) {
                    val = readPrimitive(s, cls.ai()[i]);
                } else {
                    int rt = s.readByte();
                    logger.printDiagnostic("      [RAW] member[%d] (%s) bte=%d ai=%d: rt-byte=0x%02X (dec %d) at pos 0x%X%n",
                            i, name, cls.bte()[i], cls.ai()[i], rt, rt, posBeforeRead);
                    if (rt == RT_OBJECT_NULL_MULTIPLE_256) {
                        int count = s.readByte();          // total members covered, including this one
                        nullRunRemaining = count - 1;
                        val = null;
                    } else if (rt == RT_OBJECT_NULL_MULTIPLE) {
                        int count = s.readInt32();
                        nullRunRemaining = count - 1;
                        val = null;
                    } else if (rt == RT_MEMBER_REFERENCE) {
                        // Record the target id and resolve in the second pass — the
                        // referenced object may be serialized later in the stream.
                        pendingRefs.put(name, s.readInt32());
                        val = null;
                    } else if (cls.bte()[i] == BTE_PRIMITIVE_ARRAY) {
                        val = readPrimArrayMemberFromTag(s, rt, cls.ai()[i], classDefs, objectStore);
                    } else {
                        val = readMemberRecordFromTag(s, rt, classDefs, objectStore);
                    }
                }
            } catch (Exception e) {
                System.err.printf("[WARN] member[%d] (%s) pos=0x%X bte=%d ai=%d: parse error, stopping early: %s%n",
                        i, name, posBeforeRead, cls.bte()[i], cls.ai()[i], e.getMessage());
                break;  // return partial results rather than crashing
            }
            logger.printDiagnostic("[%3d] pos=0x%X  bte=%d ai=%d  %-45s = %s%n",
                    i, posBeforeRead, cls.bte()[i], cls.ai()[i], name, formatDbg(val));
            result.put(name, val);
        }
    }

    private String formatDbg(Object v) {
        if (v == null) return "<null>";
        if (v instanceof Long l)   return l + " (0x" + Long.toHexString(l) + ")";
        if (v instanceof Short sh) return sh + " (0x" + Integer.toHexString(sh & 0xFFFF) + ")";
        if (v instanceof Integer n) return n + " (0x" + Integer.toHexString(n) + ")";
        if (v instanceof Boolean b) return b.toString();
        if (v instanceof long[] a) return "long[" + a.length + "]";
        if (v instanceof short[] a) return "short[" + a.length + "]";
        if (v instanceof boolean[] a) return "boolean[" + a.length + "]";
        return v.getClass().getSimpleName() + ":" + v;
    }

    private void skipClassValues(NrbfStream s, ClassInfo cls,
                                 Map<Integer, ClassInfo> classDefs,
                                 Map<Integer, Object>    objectStore) throws IOException {
        int nullRunRemaining = 0;
        for (int i = 0; i < cls.memberNames().length; i++) {
            if (nullRunRemaining > 0) {
                nullRunRemaining--;
                continue;
            }
            if (cls.bte()[i] == BTE_PRIMITIVE) {
                readPrimitive(s, cls.ai()[i]);
                continue;
            }
            int rt = s.readByte();
            if (rt == RT_OBJECT_NULL_MULTIPLE_256) {
                int count = s.readByte();
                nullRunRemaining = count - 1;
            } else if (rt == RT_OBJECT_NULL_MULTIPLE) {
                int count = s.readInt32();
                nullRunRemaining = count - 1;
            } else if (cls.bte()[i] == BTE_PRIMITIVE_ARRAY) {
                readPrimArrayMemberFromTag(s, rt, cls.ai()[i], classDefs, objectStore);
            } else {
                readMemberRecordFromTag(s, rt, classDefs, objectStore);
            }
        }
    }

    /**
     * Reads the value of a BTE=7 (PrimitiveArray) member from the stream.
     *
     * <p>Handles both standard NRBF records (ArraySinglePrimitive, MemberReference,
     * ObjectNull) and Unity's non-standard compact inline format, where the record-type
     * byte is not a recognised NRBF record type. In that case the byte is treated as a
     * count of inline elements, each of {@code primSize(elemPte)} bytes, which are then
     * read and returned as the appropriate Java primitive array.
     *
     * <p>Specifically: a count byte of 0 is the compact null/empty encoding.
     */
    private Object readPrimArrayMemberFromTag(NrbfStream s, int rt, int elemPte,
                                       Map<Integer, ClassInfo> classDefs,
                                       Map<Integer, Object>    objectStore) throws IOException {
        return switch (rt) {
            case RT_ARRAY_SINGLE_PRIMITIVE -> {
                int id  = s.readInt32();
                int len = s.readInt32();
                int pte = s.readByte();
                Object arr = readPrimArray(s, pte, len);
                objectStore.put(id, arr);
                yield arr;
            }
            case RT_BINARY_ARRAY -> {
                skipBinaryArray(s, classDefs, objectStore);
                yield null;
            }
            case RT_MEMBER_REFERENCE       -> objectStore.get(s.readInt32());
            case RT_OBJECT_NULL            -> null;
            case RT_OBJECT_NULL_MULTIPLE_256 -> { s.skip(1); yield null; }
            case RT_OBJECT_NULL_MULTIPLE   -> { s.skip(4); yield null; }
            default ->
                // Unity compact null / unrecognised encoding – consume only the 1 byte
                // already read and treat the member as null.
                null;
        };
    }

    /**
     * Reads the next record from the stream as a member value.
     * The caller must NOT have consumed the record-type byte yet.
     */
    private Object readMemberRecordFromTag(NrbfStream s, int rt,
                                    Map<Integer, ClassInfo> classDefs,
                                    Map<Integer, Object>    objectStore) throws IOException {
        return switch (rt) {
            case RT_CLASS_WITH_ID -> {
                int id     = s.readInt32();
                int metaId = s.readInt32();
                ClassInfo cls = classDefs.get(metaId);
                if (cls != null) {
                    ClassInfo inst = new ClassInfo(id, cls.memberNames(), cls.bte(), cls.ai());
                    classDefs.put(id, inst);
                    skipClassValues(s, inst, classDefs, objectStore);
                }
                yield objectStore.get(id);
            }
            case RT_SYSTEM_CLASS_WITH_MEMBERS_AND_TYPES -> {
                ClassInfo cls = readSystemClassDef(s);
                classDefs.put(cls.objectId(), cls);
                skipClassValues(s, cls, classDefs, objectStore);
                yield null;
            }
            case RT_CLASS_WITH_MEMBERS_AND_TYPES -> {
                ClassInfo cls = readClassDef(s);
                classDefs.put(cls.objectId(), cls);
                skipClassValues(s, cls, classDefs, objectStore);
                yield null;
            }
            case RT_BINARY_OBJECT_STRING -> {
                int id  = s.readInt32();
                String v = s.readLPString();
                objectStore.put(id, v);
                yield v;
            }
            case RT_BINARY_ARRAY -> {
                skipBinaryArray(s, classDefs, objectStore);
                yield null;
            }
            case RT_MEMBER_PRIMITIVE_TYPED -> {
                int pte = s.readByte();
                yield readPrimitive(s, pte);
            }
            case RT_MEMBER_REFERENCE       -> objectStore.get(s.readInt32()); // may be null (forward ref)
            case RT_OBJECT_NULL            -> null;
            case 0                         -> null; // Unity compact null
            case RT_OBJECT_NULL_MULTIPLE_256 -> { s.skip(1); yield null; }
            case RT_OBJECT_NULL_MULTIPLE   -> { s.skip(4); yield null; }
            case RT_ARRAY_SINGLE_PRIMITIVE -> {
                int id  = s.readInt32();
                int len = s.readInt32();
                int pte = s.readByte();
                Object arr = readPrimArray(s, pte, len);
                objectStore.put(id, arr);
                yield arr;
            }
            case RT_ARRAY_SINGLE_OBJECT -> {
                skipArraySingleObject(s, classDefs, objectStore);
                yield null;
            }
            case RT_ARRAY_SINGLE_STRING -> {
                skipArraySingleString(s, classDefs, objectStore);
                yield null;
            }
            default -> null; // Unity non-standard encoding – treat as null, 1 byte already consumed
        };
    }

    // ── Primitive reading ─────────────────────────────────────────────────────

    private Object readPrimitive(NrbfStream s, int pte) throws IOException {
        return switch (pte) {
            case PTE_BOOLEAN  -> s.readBoolean();
            case PTE_BYTE     -> s.readUByte();
            case PTE_CHAR     -> (char) s.readUInt16();
            case PTE_DECIMAL  -> { s.readLPString(); yield null; } // decimal encoded as string
            case PTE_DOUBLE   -> s.readDouble();
            case PTE_INT16    -> s.readInt16();
            case PTE_INT32    -> s.readInt32();
            case PTE_INT64    -> s.readInt64();
            case PTE_SBYTE    -> (int) s.readSByte();
            case PTE_SINGLE   -> s.readFloat();
            case PTE_TIMESPAN -> s.readInt64(); // 100-ns ticks
            case PTE_DATETIME -> s.readInt64(); // 100-ns ticks (packed with Kind bits)
            case PTE_UINT16   -> s.readUInt16();
            case PTE_UINT32   -> s.readUInt32();
            // UInt64 is read into a signed Java long, then widened to an unsigned BigInteger so
            // values above Long.MAX_VALUE (~9.2 quintillion, e.g. lifetime gem/stone totals) don't
            // surface as negative numbers. Always non-negative and in [0, 2^64).
            case PTE_UINT64   -> toUnsignedBigInteger(s.readInt64());
            case 31 -> { s.skip(4); yield null; } // Unity PTE=31: unknown 4-byte type
            default -> throw new IOException("Unknown PrimitiveTypeEnum: " + pte + " at pos 0x" + Integer.toHexString(s.pos() - 1));
        };
    }

    /** Reinterprets the 64 raw bits as an unsigned value in [0, 2^64). */
    private static BigInteger toUnsignedBigInteger(long raw) {
        return new BigInteger(Long.toUnsignedString(raw));
    }

    private Object readPrimArray(NrbfStream s, int pte, int length) throws IOException {
        return switch (pte) {
            case PTE_BOOLEAN  -> { boolean[] a = new boolean[length]; for (int i=0;i<length;i++) a[i]=s.readBoolean(); yield a; }
            case PTE_BYTE     -> s.readBytes(length);
            case PTE_INT16    -> { short[]   a = new short[length];   for (int i=0;i<length;i++) a[i]=s.readInt16();   yield a; }
            case PTE_INT32    -> { int[]     a = new int[length];     for (int i=0;i<length;i++) a[i]=s.readInt32();   yield a; }
            case PTE_INT64    -> { long[]    a = new long[length];    for (int i=0;i<length;i++) a[i]=s.readInt64();   yield a; }
            case PTE_SINGLE   -> { float[]   a = new float[length];   for (int i=0;i<length;i++) a[i]=s.readFloat();   yield a; }
            case PTE_DOUBLE   -> { double[]  a = new double[length];  for (int i=0;i<length;i++) a[i]=s.readDouble();  yield a; }
            case PTE_TIMESPAN -> { long[]    a = new long[length];    for (int i=0;i<length;i++) a[i]=s.readInt64();   yield a; }
            case PTE_DATETIME -> { long[]    a = new long[length];    for (int i=0;i<length;i++) a[i]=s.readInt64();   yield a; }
            case PTE_UINT16   -> { int[]     a = new int[length];     for (int i=0;i<length;i++) a[i]=s.readUInt16();  yield a; }
            default           -> { s.skip(length * primSize(pte)); yield null; }
        };
    }

    private int primSize(int pte) {
        return switch (pte) {
            case PTE_BOOLEAN, PTE_BYTE, PTE_SBYTE -> 1;
            case PTE_CHAR, PTE_INT16, PTE_UINT16  -> 2;
            case PTE_INT32, PTE_UINT32, PTE_SINGLE -> 4;
            default                                -> 8; // Int64, UInt64, Double, TimeSpan, DateTime
        };
    }

    // ── Complex-type skipping ─────────────────────────────────────────────────

    /**
     * Called after the record-type byte (7) has been consumed.
     * Reads and discards a BinaryArray record (handles primitive and object-element arrays).
     */
    private void skipBinaryArray(NrbfStream s,
                                 Map<Integer, ClassInfo> classDefs,
                                 Map<Integer, Object>    objectStore) throws IOException {
        s.skip(4); // objectId
        int arrayType = s.readByte(); // BinaryArrayTypeEnum (0-5)
        int rank      = s.readInt32();

        int total = 1;
        for (int i = 0; i < rank; i++) total *= s.readInt32(); // lengths per dimension

        // BinaryArrayType >= 3 means "Offset" variant → has LowerBounds array
        if (arrayType >= 3) s.skip(rank * 4);

        int bteElem = s.readByte();
        int aiElem  = switch (bteElem) {
            case BTE_PRIMITIVE, BTE_PRIMITIVE_ARRAY -> s.readByte();
            case BTE_SYSTEM_CLASS -> { s.readLPString(); yield -1; }
            case BTE_CLASS        -> { s.readLPString(); s.skip(4); yield -2; }
            default               -> -3;
        };

        if (bteElem == BTE_PRIMITIVE) {
            // Elements are raw inline bytes
            s.skip(total * primSize(aiElem));
        } else {
            // Elements are records (with record-type headers), handle null multiples
            int remaining = total;
            while (remaining > 0) {
                int rt = s.readByte();
                if (rt == RT_OBJECT_NULL_MULTIPLE_256) {
                    remaining -= s.readByte();
                } else if (rt == RT_OBJECT_NULL_MULTIPLE) {
                    remaining -= s.readInt32();
                } else {
                    dispatchRecord(s, rt, classDefs, objectStore);
                    remaining--;
                }
            }
        }
    }

    private void skipArraySingleObject(NrbfStream s,
                                       Map<Integer, ClassInfo> classDefs,
                                       Map<Integer, Object>    objectStore) throws IOException {
        s.skip(4); // objectId
        int len       = s.readInt32();
        int remaining = len;
        while (remaining > 0) {
            int rt = s.readByte();
            if (rt == RT_OBJECT_NULL_MULTIPLE_256) {
                remaining -= s.readByte();
            } else if (rt == RT_OBJECT_NULL_MULTIPLE) {
                remaining -= s.readInt32();
            } else {
                dispatchRecord(s, rt, classDefs, objectStore);
                remaining--;
            }
        }
    }

    private void skipArraySingleString(NrbfStream s,
                                       Map<Integer, ClassInfo> classDefs,
                                       Map<Integer, Object>    objectStore) throws IOException {
        s.skip(4); // objectId
        int len = s.readInt32();
        for (int i = 0; i < len; i++) readMemberRecordFromTag(s, s.readByte(), classDefs, objectStore);
    }

    /**
     * Dispatches a record by its already-consumed type byte.
     * Used when iterating elements of an object/string array.
     */
    private void dispatchRecord(NrbfStream s, int rt,
                                Map<Integer, ClassInfo> classDefs,
                                Map<Integer, Object>    objectStore) throws IOException {
        switch (rt) {
            case RT_CLASS_WITH_ID -> {
                int id     = s.readInt32();
                int metaId = s.readInt32();
                ClassInfo cls = classDefs.get(metaId);
                if (cls != null) {
                    ClassInfo inst = new ClassInfo(id, cls.memberNames(), cls.bte(), cls.ai());
                    classDefs.put(id, inst);
                    skipClassValues(s, inst, classDefs, objectStore);
                }
            }
            case RT_SYSTEM_CLASS_WITH_MEMBERS_AND_TYPES -> {
                ClassInfo cls = readSystemClassDef(s);
                classDefs.put(cls.objectId(), cls);
                skipClassValues(s, cls, classDefs, objectStore);
            }
            case RT_CLASS_WITH_MEMBERS_AND_TYPES -> {
                ClassInfo cls = readClassDef(s);
                classDefs.put(cls.objectId(), cls);
                skipClassValues(s, cls, classDefs, objectStore);
            }
            case RT_BINARY_OBJECT_STRING       -> { int id = s.readInt32(); objectStore.put(id, s.readLPString()); }
            case RT_BINARY_ARRAY               -> skipBinaryArray(s, classDefs, objectStore);
            case RT_MEMBER_PRIMITIVE_TYPED     -> { int pte = s.readByte(); readPrimitive(s, pte); }
            case RT_MEMBER_REFERENCE           -> s.skip(4);
            case RT_OBJECT_NULL                -> { /* nothing */ }
            case 0                             -> { /* Unity compact null */ }
            case RT_ARRAY_SINGLE_PRIMITIVE     -> { s.skip(4); int len = s.readInt32(); int pte = s.readByte(); s.skip(len * primSize(pte)); }
            case RT_ARRAY_SINGLE_OBJECT        -> skipArraySingleObject(s, classDefs, objectStore);
            case RT_ARRAY_SINGLE_STRING        -> skipArraySingleString(s, classDefs, objectStore);
            default -> { /* Unity non-standard byte – treat as one null element, 1 byte already consumed */ }
        }
    }

    // ── Low-level stream reader ───────────────────────────────────────────────

    private static final class NrbfStream {
        private final byte[]     data;
        private       int        pos;
        private final ByteBuffer buf;

        NrbfStream(byte[] data) {
            this.data = data;
            this.pos  = 0;
            this.buf  = ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        }

        int pos() { return pos; }

        int readByte()     { return data[pos++] & 0xFF; }
        int readUByte()    { return data[pos++] & 0xFF; }
        byte readSByte()   { return data[pos++]; }
        boolean readBoolean() { return data[pos++] != 0; }

        byte[] readBytes(int n) {
            byte[] b = Arrays.copyOfRange(data, pos, pos + n);
            pos += n;
            return b;
        }

        short readInt16()  { short  v = buf.getShort(pos);  pos += 2; return v; }
        int   readUInt16() { int    v = buf.getShort(pos) & 0xFFFF; pos += 2; return v; }
        int   readInt32()  { int    v = buf.getInt(pos);    pos += 4; return v; }
        long  readUInt32() { long   v = buf.getInt(pos) & 0xFFFFFFFFL; pos += 4; return v; }
        long  readInt64()  { long   v = buf.getLong(pos);   pos += 8; return v; }
        float readFloat()  { float  v = buf.getFloat(pos);  pos += 4; return v; }
        double readDouble(){ double v = buf.getDouble(pos); pos += 8; return v; }

        String readLPString() {
            int length = 0, shift = 0, b;
            do {
                b       = data[pos++] & 0xFF;
                length |= (b & 0x7F) << shift;
                shift  += 7;
            } while ((b & 0x80) != 0);
            String s = new String(data, pos, length, StandardCharsets.UTF_8);
            pos += length;
            return s;
        }

        void skip(int n) { pos += n; }
    }
}
