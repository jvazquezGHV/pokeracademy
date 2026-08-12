import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export const getAIFeedback = async (handHistory, customPrompt = null) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    let prompt = customPrompt;
    if (!prompt) {
      prompt = `You are a friendly, professional poker coach. Analyze the following hand history from a beginner Texas Hold'em player playing heads-up against a computer. 
      
      Focus on the "Hero" (the player). 
      Speak directly to the user in natural, conversational language (e.g., "You played this well, but on the river...").
      Do not just summarize the betting log. Look at the cards they held and the board cards, and tell them if their bets/calls/folds were strategically sound based on their actual hand strength. Keep it to 2 or 3 short paragraphs.
      
      Hand History: 
      ${handHistory}`;
    }
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("AI Feedback Error:", error);
    return "Error connecting to AI Coach. Keep practicing!";
  }
};
