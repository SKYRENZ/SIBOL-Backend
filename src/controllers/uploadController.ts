// 1. Create uploadController.ts
import type { Request, Response } from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import * as rewardService from "../services/rewardService"; // ✅ used by uploadClaimedRewardAttachment

const storage = multer.memoryStorage();

// default generic upload (if you use it elsewhere)
const upload = multer({ storage });

// signup attachment: allow images only, increase size limit e.g. 10MB
const signupUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    console.log('[signupUpload] incoming file:', { fieldname: file.fieldname, originalname: file.originalname, mimetype: file.mimetype });
    const ok = /^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype);
    if (ok) return cb(null, true);
    const err: any = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
    err.message = 'Invalid file type: only images are allowed';
    return cb(err);
  },
});

// --- NEW: reward uploads only accept jpeg/jpg/png and limit size (5MB) ---
const rewardUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    // accept image/jpeg and image/png (jpeg covers .jpg)
    const ok = /^image\/(jpeg|png)$/i.test(file.mimetype);
    if (ok) return cb(null, true);
    const err: any = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
    err.message = 'Invalid file type: only JPEG and PNG images are allowed for rewards';
    return cb(err);
  },
});

export const uploadMiddleware = upload.single("file");
export const signupAttachmentMiddleware = signupUpload.single("attachment");
// use rewardUpload for reward image routes
export const rewardImageUploadMiddleware = rewardUpload.single("file");

export async function uploadFile(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const base64Data = req.file.buffer.toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${base64Data}`;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'maintenance_attachments',
      resource_type: 'auto',
    });

    return res.status(200).json({
      filepath: result.secure_url,
      publicId: result.public_id,
    });
  } catch (err: any) {
    console.error("Upload error:", err.message);
    return res.status(500).json({
      message: err.message || "File upload failed",
      error: err.name || "UploadError",
    });
  }
}

export async function uploadRewardImage(req: Request, res: Response) {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // extra guard (should be enforced by multer already)
    if (!/^image\/(jpeg|png)$/i.test(req.file.mimetype)) {
      return res.status(400).json({ message: "Only JPEG/PNG images are allowed" });
    }

    const base64Data = req.file.buffer.toString("base64");
    const dataURI = `data:${req.file.mimetype};base64,${base64Data}`;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "rewards",
      resource_type: "image",
    });

    return res.status(200).json({
      imageUrl: result.secure_url,
      publicId: result.public_id,
    });
  } catch (err: any) {
    console.error("Reward image upload error:", err?.message || err);
    // If multer threw a MulterError, surface it clearly
    if (err && err.name === 'MulterError') {
      return res.status(400).json({ message: err.message || 'Upload validation failed', code: err.code });
    }
    return res.status(500).json({ message: err.message || "File upload failed" });
  }
}

// ----------------- NEW: reward transaction attachments -----------------

/**
 * Upload an attachment for a reward transaction and insert DB row.
 * Protected route should provide req.user.Account_id.
 * Expects multipart/form-data with field "file" and body.reward_transaction_id
 */
export async function uploadClaimedRewardAttachment(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    // enforce image-only for reward attachments as well
    if (!/^image\/(jpeg|png)$/i.test(file.mimetype)) {
      return res.status(400).json({ message: "Only JPEG/PNG images are allowed for reward attachments" });
    }

    const txId = Number(req.body.reward_transaction_id ?? req.body.Reward_transaction_id);
    if (!txId) return res.status(400).json({ message: "Missing reward_transaction_id" });

    const exists = await rewardService.transactionExists(txId);
    if (!exists) return res.status(404).json({ message: "Reward transaction not found" });

    const base64Data = file.buffer.toString("base64");
    const dataURI = `data:${file.mimetype};base64,${base64Data}`;
    const folder = `reward_attachments/tx_${txId}`;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder,
      resource_type: "image",
    });

    const authUser: any = (req as any).user;
    const accountId = Number(authUser?.Account_id ?? req.body.account_id ?? null) || null;

    const attachment = await rewardService.insertRewardAttachment({
      Reward_transaction_id: txId,
      Account_id: accountId,
      File_path: result.secure_url,
      Public_id: result.public_id,
      File_name: file.originalname,
      File_type: file.mimetype,
      File_size: file.size,
      Created_by: accountId,
    });

    return res.status(201).json({ attachment });
  } catch (err: any) {
    console.error("uploadClaimedRewardAttachment error:", err);
    if (err && err.name === 'MulterError') {
      return res.status(400).json({ message: err.message || 'Upload validation failed', code: err.code });
    }
    return res.status(500).json({ message: err?.message ?? "Upload failed" });
  }
}