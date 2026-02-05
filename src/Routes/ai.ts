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

    const currentPressure_psi =
      typeof currentData.pressure_mv === "number"
        ? mvToPsi(currentData.pressure_mv)
        : null;

    // Compute avgPH from RRL
    const normalPHs = rrlData
      .map(r => r.ph)
      .filter((v): v is number => v !== null);

    const avgPH =
      normalPHs.length > 0
        ? normalPHs.reduce((a, b) => a + b, 0) / normalPHs.length
        : null;

    // Quick status message
    let message = "System is normal.";
    if (avgPH !== null && currentData.ph < avgPH - 0.5) {
      message =
        "pH dropped below the expected range. Possible acidification detected. Consider reducing or stopping feeding.";
    }

    // Detailed message (always computed if avgPH exists)
    let detailedMessage: string | null = null;
    if (avgPH !== null) {
      detailedMessage = `
Your current pH is ${currentData.ph}, which is ${
        currentData.ph < avgPH ? "lower than" : "within"
      } the expected operating range.

A stable digester usually has a pH around ${avgPH.toFixed(2)}.

A drop in pH may indicate that the digester environment is becoming acidic. This can slow down or stress the digestion process.
To help stabilize the system, it is recommended to reduce or temporarily stop feeding and continue monitoring pH levels closely.
      `;
    }

    // Feeding message only at 6 AM
    let feedingMessage: string | null = null;
    if (hour === 6) {
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
