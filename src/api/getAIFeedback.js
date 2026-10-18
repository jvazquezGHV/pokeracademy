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
      
      CRITICAL ACCURACY RULES:
      - Always verify the exact cards, ranks, and suits on each street before describing them.
      - Count suits carefully: Count how many cards of a given suit are on the community board versus in the player's hole cards. Never say "there were four hearts on the board" unless there are literally 4 heart cards among the community cards.
      - Distinguish clearly between when a player makes a flush using 2 hole cards + 3 board cards versus when there is a 4-flush on the board itself.
      
      IMPORTANT: If the hand history is extremely short (e.g. someone folded pre-flop immediately), do not fail or complain. Just provide a very brief 1-sentence tip like "Good discipline folding that weak hand!" or "Nice job stealing the blinds early!"
      
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
