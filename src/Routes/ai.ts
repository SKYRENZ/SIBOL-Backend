import express from "express";
import { getRRLData, RRLRow } from "../ai/knowledgeBase";
import { mvToPsi } from "../ai/dataProcessor";

const router = express.Router();

router.post("/analyze", async (req, res) => {
  try {
    const currentData = req.body; // { ph, temperature_c, pressure_mv }

    // Convert pressure mV to PSI
    const pressure_psi = currentData.pressure_mv
      ? mvToPsi(currentData.pressure_mv)
      : null;

    // Fetch all RRL reference data
    const rrlData: RRLRow[] = await getRRLData();

    // Only include rows where ph is not null
    const validPHRows = rrlData.map(r => r.ph).filter((v): v is number => v !== null);

    // Compute average pH
    const avgPH = validPHRows.length > 0
      ? validPHRows.reduce((a, b) => a + b, 0) / validPHRows.length
      : null;

    let message = "System is normal.";
    let detailedMessage = "The pH reading is within the expected range based on literature data.";

    if (avgPH !== null && currentData.ph < avgPH - 0.5) {
      message =
        "pH dropped below normal range. Possible acidification. Suggest reducing or stopping feeding.";

      // Create a more detailed explanation
      detailedMessage = `
        Your current pH is ${currentData.ph}, which is lower than the normal range
        based on literature sources. We calculated the average normal pH from 
        multiple reference studies (RRLs) which is around ${avgPH.toFixed(2)}.
        
        A drop in pH can indicate that the digester is becoming acidic, which 
        might slow down or stress the digestion process. To help the digester recover,
        it is suggested to reduce or temporarily stop feeding and monitor pH closely.
        
        "Normal" here means the pH values reported in previous scientific studies
        for stable anaerobic digestion. We used all the RRL data where pH was provided
        to calculate this normal range.
      `;
    }

    res.json({
      avgPH,
      message,
      detailedMessage,
      currentPressure_psi: pressure_psi,
    });
  } catch (err) {
    console.error("Error in /analyze route:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
