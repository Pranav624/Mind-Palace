import { config } from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { LLMChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";
import readline from "readline-sync";
import fs from 'fs/promises';

config();

// Initialize the OpenAI model
const model = new ChatOpenAI({
  openAIApiKey: process.env.OPENAI_API_KEY,
  temperature: 0.9,
  streaming: true,
  model: "gpt-4o",
});

// Create a prompt template
const template = `
You will be known as Pranav's brain, his mind palace. Pranav is the name of the user. 
Respond to him directly.

Current mind palace structure: {mind_palace}

# RULES:
1. If Pranav asks a question, answer it to the best of your ability.
2. If Pranav wants to add a memory:
  a. The room names are: [People].
  b. First categorize it into the appropriate room, call it "room_name".
  c. If the memory is not related to any of the rooms, create a new room for it.
  c. Then, describe the memory in as few words as possible but without losing any details, call it "memory_description".
3. If Pranav wants to search for a memory:
  a. First, determine which room in the mind palace is most relevant to this query, call it "most_relevant_room_name".
  b. Then, search through that room's memories to find the most relevant memories.
  c. If you couldn't find anything that answers Pranav's query, say "No memories found."
4. Today's date is ${new Date().toISOString().split('T')[0]}.

# RESPONSE FORMAT:
If the query is about adding a new memory, respond with:
{{
  "room": "room_name",
  "memory": "description_of_memory"
}}

If the query is about searching for a memory, respond with:
A summary of the memories answering the query.

User input: {input}`;

const prompt = PromptTemplate.fromTemplate(template);

// Create a BufferMemory for chat history
const memory = new BufferMemory({
  memoryKey: "chat_history",
  inputKey: "input",
});

// Create an LLMChain
const chain = new LLMChain({ 
  llm: model, 
  prompt,
  memory,
});

async function readMindPalace() {
  try {
    const data = await fs.readFile('mind_palace.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return { Rooms: [] };
  }
}

async function writeMindPalace(mindPalace) {
  await fs.writeFile('mind_palace.json', JSON.stringify(mindPalace, null, 2));
}

async function addMemory(room, description) {
  const mindPalace = await readMindPalace();
  let targetRoom = mindPalace.Rooms.find(r => r.Name === room);
  if (!targetRoom) {
    targetRoom = { Name: room, Memories: [] };
    mindPalace.Rooms.push(targetRoom);
  }
  const today = new Date().toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format
  targetRoom.Memories.push({ Day: today, Description: description });
  await writeMindPalace(mindPalace);
}

async function fetchMemories(room, keywords) {
  const mindPalace = await readMindPalace();
  const targetRoom = mindPalace.Rooms.find(r => r.Name.toLowerCase() === room.toLowerCase());
  
  if (!targetRoom) return [];

  return targetRoom.Memories.filter(memory => 
    keywords.some(keyword => 
      memory.Description.toLowerCase().includes(keyword.toLowerCase())
    )
  );
}

async function main() {
  while (true) {
    const userInput = readline.question('Enter a memory, ask a question, or search memories (type "exit" to quit): ');
    
    if (userInput.toLowerCase() === 'exit') {
      console.log('Goodbye!');
      break;
    }

    try {
      const mindPalace = await readMindPalace();
      const response = await chain.call({ input: userInput, mind_palace: JSON.stringify(mindPalace) });
      console.log(response.text);

      try {
        const parsedResponse = JSON.parse(response.text);
        if (parsedResponse.room && parsedResponse.memory) {
          await addMemory(parsedResponse.room, parsedResponse.memory);
          console.log('Memory added successfully!');
        } 
        else if (parsedResponse.room && parsedResponse.keywords) {
          const memories = await fetchMemories(parsedResponse.room, parsedResponse.keywords);
          if (memories.length > 0) {
            console.log(`Matching memories in room "${parsedResponse.room}":`);
            memories.forEach(memory => {
              console.log(`Day: ${memory.Day}, Description: ${memory.Description}`);
            });
          } 
          else {
            console.log(`No matching memories found in room "${parsedResponse.room}".`);
          }
        }
      } catch (error) {
        
      }
      
    } catch (error) {
      console.error('Error:', error.message);
    }

    console.log('\n');
  }
}

main();