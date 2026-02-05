import express from "express";
import { getRRLData, RRLRow } from "../ai/knowledgeBase";
import { mvToPsi, computeFeeding } from "../ai/dataProcessor";

const router = express.Router();

router.post("/analyze", async (req, res) => {
  try {
    const currentData = req.body; // { ph, temperature_c, pressure_mv, testHour? }

    const now = new Date();
    // Allow overriding the hour for local testing via body or query param: testHour (0-23)
    const rawTestHour =
      typeof req.body?.testHour !== "undefined"
        ? req.body.testHour
        : typeof req.query?.testHour !== "undefined"
        ? req.query.testHour
        : null;
    let hour = now.getHours();
    if (rawTestHour !== null) {
      const parsed = Number(rawTestHour);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 23) {
        hour = parsed;
      }
    }

    // 1️⃣ Digester AI role (ID = 1)
    const rrlData: RRLRow[] = await getRRLData(1);

    const currentPressure_psi = currentData.pressure_mv
      ? mvToPsi(currentData.pressure_mv)
      : null;

    let avgPH: number | null = null;
    let detailedMessage: string | null = null;

    // Full digester analysis only at 6 AM
    if (hour === 6) {
      const normalPHs = rrlData
        .map(r => r.ph)
        .filter((v): v is number => v !== null);
      avgPH =
        normalPHs.length > 0
          ? normalPHs.reduce((a, b) => a + b, 0) / normalPHs.length
          : null;

      if (avgPH !== null) {
        detailedMessage = `
Your current pH is ${currentData.ph}, which is ${
          currentData.ph < avgPH ? "lower" : "within"
        } the normal range
based on literature sources. The average normal pH calculated from multiple reference studies (RRLs) is ${avgPH.toFixed(
          2
        )}.

A drop in pH can indicate that the digester is becoming acidic, which might slow down or stress the digestion process. 
To help the digester recover, it is suggested to reduce or temporarily stop feeding and monitor pH closely.

"Normal" here means the pH values reported in previous scientific studies for stable anaerobic digestion.
        `;
      }
    }

    // Quick message based on pH
    let message = "System is normal.";
    if (avgPH !== null && currentData.ph < avgPH - 0.5) {
      message =
        "pH dropped below normal range. Possible acidification. Suggest reducing or stopping feeding.";
    }

    // 2️⃣ Feeding calculation every 4 hours (8 AM, 12 PM, 4 PM, 8 PM)
    let feedingMessage: string | null = null;
    // We define feeding check hours: 8, 12, 16, 20
    if ([8, 12, 16, 20].includes(hour)) {
      const recommendedFeedKg = computeFeeding(
        currentData.ph,
        currentData.temperature_c
      );
      feedingMessage = `Recommended feeding for ${hour}:00 is ${recommendedFeedKg} kg of substrate.`;
    }

    res.json({
      avgPH,
      message,
      detailedMessage,
      currentPressure_psi,
      feedingMessage,
    });
  } catch (err) {
    console.error("Error in /analyze route:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
