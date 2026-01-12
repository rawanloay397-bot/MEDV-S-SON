
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `Siz tıp dünyasında otorite kabul edilen bir Ordinaryüs Profesör ve Etimoloji Uzmanısınız. 
GÖREVİNİZ: Sunulan tıp sınavı sorularını analiz etmek ve konuyu "Mastery" seviyesinde öğretmektir.

KRİTİK PROTOKOLLER:
1. ASLA GİRİŞ/SONUÇ YAPMAYIN: "Bu sayfada...", "Analiziniz hazır..." gibi cümleleri kesinlikle kullanmayın. Doğrudan içeriğe girin.
2. DİL: Tamamen Türkçe.
3. EMOJİ KULLANIMI: Başlıklarda ve önemli noktalarda tıbbi emojiler (🩺, 🧬, 🧪, 🧠, 🏛️, 📍) kullanın.
4. ETİMOLOJİ: Geçen her hastalığın/sendromun kökenini (Yunanca/Latince) ve isimlendirme mantığını açıklayın.
5. ANALİZ YAPISI:
   - ❓ Soru Analizi: Sorunun neyi ölçtüğünü ve çeldiricilerin neden yanlış olduğunu açıklayın.
   - 🧬 Hastalık/Durum Etimolojisi: Terimlerin kökeni.
   - 📚 Konu Özeti: Sorunun ait olduğu konunun derinlemesine patofizyolojik özeti.
6. FORMAT: Markdown (.md) formatında, akıcı ama teknik terminolojiye sadık kalarak hazırlayın.`;

const USER_PROMPT = `BU SAYFADAKİ TÜM TIP SORULARINI ANALİZ ET. 
HER SORU İÇİN: 
- Sorunun mantığını açıkla.
- Hastalıkların etimolojik kökenlerini belirt.
- Konuya tam hakimiyet sağlayacak bir arka plan bilgisi sun.
- Bitmoji tadında emojilerle görselleştir.
- GİRİŞ VE GEREKSİZ DOLGU CÜMLELERİ KULLANMA.`;

export async function analyzeWithGemini(imageBase64: string, customKey?: string): Promise<string> {
  // Priority: 1. Manually typed key, 2. Environment injected key (safely accessed)
  // We check if 'process' is defined to avoid ReferenceError in some browser builds
  const envKey = typeof process !== 'undefined' && process.env ? process.env.API_KEY : undefined;
  const apiKey = customKey || envKey;
  
  if (!apiKey) {
    throw new Error("API_KEY_REQUIRED");
  }

  // Create a fresh instance for every call to ensure the latest key is used
  const ai = new GoogleGenAI({ apiKey });
  
  const data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const imagePart = {
    inlineData: { 
      mimeType: "image/jpeg", 
      data 
    }
  };

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', 
      contents: { parts: [imagePart, { text: USER_PROMPT }] },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.15,
      },
    });

    if (!response || !response.text) {
        throw new Error("Boş Yanıt: Görsel işlenemedi.");
    }
    
    return response.text;
  } catch (error: any) {
    console.error("Gemini Engine Error:", error);
    // Transform error for better UI handling
    const msg = error.message?.toLowerCase() || "";
    if (msg.includes("429") || msg.includes("quota")) throw new Error("QUOTA_EXCEEDED");
    if (msg.includes("403") || msg.includes("401") || msg.includes("not found")) throw new Error("INVALID_KEY");
    throw error;
  }
}
