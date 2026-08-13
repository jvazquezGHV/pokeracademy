import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

export const gradeChallengeHand = async (handHistory, challengeRubric) => {
  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" }
    });
    
    const prompt = `You are an expert poker AI grading a player on a specific challenge.
    
    Here is the hand history (Focus on the 'Hero'):
    ${handHistory}
    
    Here is the exact Grading Rubric for this challenge:
    ${challengeRubric}
    
    Evaluate the Hero's play according ONLY to the rubric. You must output valid JSON with two fields:
    "passed": true if they met the rubric requirements, false otherwise.
    "feedback": A 1-2 sentence explanation speaking directly to the user explaining why they passed or failed.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonStr = response.text();
    
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("AI Grading Error:", error);
    return { passed: false, feedback: "Error connecting to the AI Grader. Please try the hand again." };
  }
};
