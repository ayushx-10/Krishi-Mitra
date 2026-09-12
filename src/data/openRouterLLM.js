// OpenRouter LLM Natural Language Parser for Farmer Field Inputs
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';


/**
 * Heuristic fallback parser in case network is offline or API fails
 */
export function parseFarmerHeuristic(text) {
  const t = text.toLowerCase();
  const res = {};

  // Nitrogen calculation
  if (t.includes('urea') || t.includes('nitrogen') || t.includes('n2') || t.includes('dap') || t.includes('fertilizer') || t.includes('bag')) {
    const match = t.match(/(\d+)\s*(bag|bags|kg|kilos)?/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (t.includes('bag')) {
        res.addedNitrogen = Math.min(150, num * 23); // ~23kg N per bag of Urea
      } else {
        res.addedNitrogen = Math.min(150, num);
      }
    } else {
      res.addedNitrogen = 46;
    }
  }

  // pH calculation
  if (t.includes('ph') || t.includes('lime') || t.includes('acidic') || t.includes('alkaline') || t.includes('neutral')) {
    const match = t.match(/ph\s*(is|=)?\s*(\d+(\.\d+)?)/);
    if (match) {
      res.customPh = parseFloat(match[2]);
    } else if (t.includes('lime') || t.includes('neutral')) {
      res.customPh = 6.8;
    } else if (t.includes('acidic')) {
      res.customPh = 5.5;
    } else if (t.includes('alkaline')) {
      res.customPh = 8.0;
    }
  }

  // Crop detection
  if (t.includes('wheat')) res.cropId = 'wheat';
  else if (t.includes('rice') || t.includes('paddy')) res.cropId = 'rice';
  else if (t.includes('maize') || t.includes('corn')) res.cropId = 'maize';
  else if (t.includes('cotton')) res.cropId = 'cotton';
  else if (t.includes('sugarcane')) res.cropId = 'sugarcane';
  else if (t.includes('soybean')) res.cropId = 'soybean';
  else if (t.includes('groundnut') || t.includes('peanut')) res.cropId = 'groundnut';

  // Field/Irrigation system
  if (t.includes('canal')) res.fieldType = 'canal';
  else if (t.includes('tubewell') || t.includes('well') || t.includes('borewell')) res.fieldType = 'tubewell';
  else if (t.includes('rainfed') || t.includes('rain')) res.fieldType = 'rainfed';
  else if (t.includes('dryland') || t.includes('dry')) res.fieldType = 'dryland';
  else if (t.includes('drip') || t.includes('sprinkler') || t.includes('irrigat')) res.fieldType = 'irrigated';

  return res;
}

/**
 * Call OpenRouter LLM API to extract structured farm parameters from natural language
 */
export async function parseFarmerWithLLM(userInput) {
  const heuristic = parseFarmerHeuristic(userInput);

  if (!OPENROUTER_API_KEY) {
    return { ...heuristic, source: 'heuristic' };
  }

  const systemPrompt = `You are AgroVision AI, an expert agricultural domain entity extractor.
The user is a farmer describing field inputs in natural language.
Extract structured field parameters and return ONLY valid JSON matching this exact format:
{
  "addedNitrogen": number (0 to 150 kg N/ha, e.g. 1 bag Urea = ~23 kg N/ha, 2 bags = 46 kg N/ha),
  "customPh": number (4.5 to 9.0 soil pH, if mentioned or lime applied, e.g. 6.8),
  "cropId": string ("wheat", "rice", "maize", "cotton", "sugarcane", "soybean", "groundnut"),
  "fieldType": string ("canal", "tubewell", "irrigated", "rainfed", "dryland"),
  "summary": string (short 1-sentence summary of what was extracted)
}
DO NOT include markdown code blocks or extra text. Output JSON only.`;

  // Free OpenRouter models to try in sequence
  const models = [
    'google/gemini-2.0-flash-lite-001',
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.2-11b-vision-instruct:free',
    'qwen/qwen-2.5-coder-32b-instruct:free'
  ];

  for (const model of models) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:5178',
          'X-Title': 'AgroVision Farm Assistant'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userInput }
          ],
          temperature: 0.1,
          max_tokens: 300
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
          addedNitrogen: typeof parsed.addedNitrogen === 'number' ? parsed.addedNitrogen : heuristic.addedNitrogen,
          customPh: typeof parsed.customPh === 'number' ? parsed.customPh : heuristic.customPh,
          cropId: parsed.cropId || heuristic.cropId,
          fieldType: parsed.fieldType || heuristic.fieldType,
          summary: parsed.summary || 'Extracted via AgroVision OpenRouter LLM',
          source: `LLM (${model})`
        };
      }
    } catch (err) {
      console.warn(`OpenRouter model ${model} attempt notice:`, err);
    }
  }

  // Fallback if all LLM attempts fail
  return { ...heuristic, source: 'heuristic fallback' };
}
