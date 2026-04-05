import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@my-better-t-app/env/server";

export const s3 = new S3Client({
  credentials: {
    accessKeyId: env.BUCKET_ACCESS_KEY,
    secretAccessKey: env.BUCKET_SECRET_KEY,
  },
  endpoint: env.BUCKET_ENDPOINT,
  forcePathStyle: true,
  region: env.BUCKET_REGION,
});

export const uploadChunk = async (key: string, data: Buffer): Promise<void> => {
  await s3.send(
    new PutObjectCommand({
      Body: data,
      Bucket: env.BUCKET_NAME,
      ContentType: "audio/wav",
      Key: key,
    }),
  );
};

export const chunkExistsInBucket = async (key: string): Promise<boolean> => {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: env.BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
};
