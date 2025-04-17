import { createLogger } from '../utils/logger';
import { Context } from '@modelcontextprotocol/sdk/server';
import { AppConfig } from '../types/agent';
import { Configuration, OpenAIApi } from 'openai';

const logger = createLogger('codex-service');

/**
 * Calls the OpenAI API to generate a response from Codex
 * @param userMessage The user's message
 * @param context The MCP context containing relevant files, etc.
 * @param config Application configuration with API key, model settings, etc.
 * @returns Promise with the AI model's response text
 */
export async function callCodexApi(
    userMessage: string,
    context: Context,
    config: AppConfig
): Promise<string> {
    logger.info('Calling Codex API...');
    
    // Check for API key
    if (!config.openaiApiKey) {
        logger.error('OpenAI API key not configured');
        throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable or configure it in the settings.');
    }
    
    // Get model settings
    const modelName = config.agent?.modelName || 'gpt-4-turbo';
    const temperature = config.agent?.temperature || 0.7;
    const maxTokens = config.agent?.maxTokens || 4000;
    
    try {
        // Initialize OpenAI API client
        const openai = new OpenAIApi(new Configuration({
            apiKey: config.openaiApiKey,
        }));

        // Format the prompt with user message and context
        const prompt = formatPrompt(userMessage, context);

        // Call the OpenAI API
        const response = await openai.createCompletion({
            model: modelName,
            prompt: prompt,
            max_tokens: maxTokens,
            temperature: temperature,
        });

        // Extract and return the response text
        const responseText = response.data.choices[0].text.trim();
        return responseText;
    } catch (error: any) {
        logger.error({ err: error }, 'Error calling Codex API');
        throw new Error(`Failed to call Codex API: ${error.message}`);
    }
}

/**
 * Formats the prompt for the OpenAI API call
 * @param userMessage The user's message
 * @param context The MCP context containing relevant files, etc.
 * @returns The formatted prompt string
 */
function formatPrompt(userMessage: string, context: Context): string {
    const systemPrompt = "You are a helpful assistant.";
    const contextInfo = `Context: ${context.files.map(file => file.path).join(', ')}`;
    return `${systemPrompt}\n\n${contextInfo}\n\nUser: ${userMessage}\nAI:`;
}
