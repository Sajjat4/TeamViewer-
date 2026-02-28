import { GoogleGenAI, GenerateContentResponse, Type, FunctionDeclaration } from "@google/genai";

export interface AgentResponse {
  text: string;
  sources: { uri: string; title: string }[];
}

const tools: FunctionDeclaration[] = [
  {
    name: "list_github_repos",
    description: "List the user's most recently updated GitHub repositories.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "create_github_issue",
    description: "Create a new issue in a GitHub repository.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        repo: {
          type: Type.STRING,
          description: "The full name of the repository (e.g., 'owner/repo').",
        },
        title: {
          type: Type.STRING,
          description: "The title of the issue.",
        },
        body: {
          type: Type.STRING,
          description: "The body content of the issue.",
        },
      },
      required: ["repo", "title"],
    },
  },
  {
    name: "send_gmail",
    description: "Send an email using the user's connected Gmail account.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: {
          type: Type.STRING,
          description: "The recipient's email address.",
        },
        subject: {
          type: Type.STRING,
          description: "The subject of the email.",
        },
        body: {
          type: Type.STRING,
          description: "The plain text body of the email.",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
];

export async function consultAgent(userQuery: string): Promise<AgentResponse> {
  // Use process.env.API_KEY if available (user selected key), otherwise fallback to GEMINI_API_KEY
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return {
      text: "## API Key Missing\n\nNo Gemini API key was found in the environment. \n\n**To resolve this:**\n1. Click the **Set API Key** button in the top-right header.\n2. Select a paid Google Cloud project with billing enabled.\n3. Once set, you can start interacting with Nexus.",
      sources: []
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      tools: [{ googleSearch: {} }, { functionDeclarations: tools }],
      systemInstruction: `You are Nexus, an advanced AI Computer Mode agent. 
      You can search the web and interact with connected apps like GitHub.
      When a user asks to perform an action on GitHub, use the provided tools.
      If a tool requires more information (like which repo to use), ask the user or search for it.
      Always provide a clear summary of what you've done.`,
    },
  });

  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      let response = await chat.sendMessage({ message: userQuery });
      
      // Handle function calls in a loop
      let iterations = 0;
      while (response.functionCalls && iterations < 5) {
        iterations++;
        const functionResponses = [];

        for (const call of response.functionCalls) {
          try {
            const res = await fetch("/api/tools/execute", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool: call.name, args: call.args }),
            });
            const result = await res.json();
            
            functionResponses.push({
              name: call.name,
              response: { content: result },
              id: call.id,
            });
          } catch (error: any) {
            functionResponses.push({
              name: call.name,
              response: { error: error.message },
              id: call.id,
            });
          }
        }

        response = await chat.sendMessage({
          message: JSON.stringify(functionResponses),
        });
      }

      const text = response.text || "Task completed.";
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks
        ? chunks
            .filter((chunk) => chunk.web)
            .map((chunk) => ({
              uri: chunk.web!.uri,
              title: chunk.web!.title,
            }))
        : [];

      return { text, sources };
    } catch (error: any) {
      console.error(`Agent error (Attempt ${retryCount + 1}):`, error);
      
      const isTransient = error.message?.includes("500") || 
                          error.message?.includes("INTERNAL") || 
                          error.message?.includes("Service Unavailable") ||
                          error.message?.includes("Deadline Exceeded");

      if (isTransient && retryCount < maxRetries - 1) {
        retryCount++;
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (error.message?.includes("429") || error.message?.includes("RESOURCE_EXHAUSTED")) {
        return {
          text: "## Quota Exhausted\n\nYou've reached the rate limit for the current API key. \n\n**To continue:**\n1. Click the **Set API Key** button in the header.\n2. Select a paid Google Cloud project with billing enabled.\n3. Try your request again.",
          sources: []
        };
      }
      if (error.message?.includes("API_KEY_INVALID") || error.message?.includes("invalid API key")) {
        return {
          text: "## Invalid API Key\n\nThe provided Gemini API key is invalid or has expired.\n\n**To fix this:**\n1. Click the **Set API Key** button in the header.\n2. Select a valid API key from a paid Google Cloud project.\n3. Try your request again.",
          sources: []
        };
      }
      if (error.message?.includes("500") || error.message?.includes("INTERNAL")) {
        return {
          text: "## Gemini Internal Error\n\nThe Gemini API encountered an internal error. This is usually temporary.\n\n**Suggestions:**\n1. Wait a few seconds and try again.\n2. If the problem persists, try switching to a different API key using the **Set API Key** button.\n3. Simplify your request.",
          sources: []
        };
      }
      throw error;
    }
  }
  
  return { text: "Failed to get a response after multiple attempts.", sources: [] };
}
