#!/usr/bin/env tsx
/**
 * Postgres backup:
 * - Requires `pg_dump` in PATH
 * - Uses DATABASE_URL
 * - Writes gzipped file to ./backups/YYYY/MM/DD/db-<timestamp>.sql.gz
 * - Optional S3 upload if AWS_* envs are present
 */
import { execFile } from "node:child_process";
import { mkdirSync, createWriteStream, createReadStream, existsSync } from "node:fs";
import { basename, join, posix as pathPosix } from "node:path";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const pipe = promisify(pipeline);

const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const now = new Date();
const ts = now.toISOString().replace(/[:.]/g, "-");

// Use forward slashes for the relative folder regardless of OS (better for S3 keys)
const relDir = `backups/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${String(
  now.getUTCDate()
).padStart(2, "0")}`;

// Local output path uses OS-specific separators
const outDir = join(process.cwd(), relDir);
const outFile = join(outDir, `db-${ts}.sql.gz`);

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

function runPgDump(): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "pg_dump",
      ["--no-owner", "--no-privileges", DATABASE_URL],
      { maxBuffer: 1024 * 1024 * 1024 } // 1GB stdout buffer cap (prevents EOUTPUTEXCEEDED)
    );
    if (!child.stdout) return reject(new Error("No stdout from pg_dump"));
    child.once("error", reject);
    child.stderr?.on("data", (d) => process.stderr.write(d));
    resolve(child.stdout);
  });
}

async function maybeUploadToS3(localPath: string) {
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (!bucket) return;

  const region = process.env.AWS_REGION || "us-east-1";
  const s3 = new S3Client({ region });

  // Ensure POSIX-style key (S3 requires forward slashes)
  const key = pathPosix.join(relDir, basename(localPath));

  const body = createReadStream(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/gzip",
    })
  );
  console.log(`Uploaded to s3://${bucket}/${key}`);
}

async function main() {
  console.log("Starting pg_dump ->", outFile);
  const src = await runPgDump();
  const gzip = zlib.createGzip({ level: 9 });
  const sink = createWriteStream(outFile);

  await pipe(src, gzip, sink);

  console.log("Backup complete:", outFile);
  await maybeUploadToS3(outFile);
}

main().catch((e) => {
  console.error("Backup failed:", e);
  process.exit(1);
});
