import express from "express";
import multer from "multer";
import cors from "cors";
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" }));

const upload = multer({ dest: "uploads/" });

// Change this to your real backend bucket name
const BUCKET = "my-node-file-manager-backend";

const s3 = new S3Client({ region: "eu-west-1" });

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: file.originalname,
        Body: fs.createReadStream(file.path)
      })
    );

    fs.unlinkSync(file.path);
    res.json({ message: "File uploaded", file: file.originalname });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

app.get("/files", async (req, res) => {
  try {
    const data = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET })
    );
    const files = (data.Contents || []).map(obj => obj.Key);
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Listing failed" });
  }
});

app.get("/download/:filename", async (req, res) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: req.params.filename
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 300 });
    res.json({ downloadUrl: url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Download failed" });
  }
});

app.delete("/delete/:filename", async (req, res) => {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: req.params.filename
      })
    );
    res.json({ message: "File deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

const PORT = 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
