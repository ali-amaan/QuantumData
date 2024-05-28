import fs from 'fs';
import path from 'path';
import { Configuration, OpenAIApi } from 'openai';
import { promises as fsPromises } from 'fs';
import he from 'he';
import { setTimeout } from "timers/promises";
import XLSX from 'xlsx';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const GPTModel = "gpt-3.5-turbo-16k"; // Switch this to "gpt-4" or "gpt-3.5-turbo-16k" here.
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY, // Load API key from environment variable
});

  const openai = new OpenAIApi(configuration);


const prompts = [  
  "Who are the actors mentioned in the following text, and what emotions does the following text associate with each. Text: ",
];
/*
[  
  "Extract all sentences related to future expectations from the following text. Text: ",
  "Extract all sentences related the emotion of curiosity from the following text: ",
];
*/

// Get the folder name from the command line arguments
const folderName = process.argv[2];

if (!folderName) {
  console.error('Please provide a folder name as an argument');
  process.exit(1);
}

// Check if the folder exists
if (!fs.existsSync(folderName)) {
  console.error('The folder does not exist');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function GPT(GPTprompt){
  console.log("Sending prompt.");
  var prompt = GPTprompt;
  if(prompt.length > 7000)
    prompt = prompt.substring(0,7000);
  try
  {
    var response = await openai.createChatCompletion({
      model: GPTModel,     
      messages: [{role: "system", content:""},
          {role: "user", content: prompt,}],
      temperature: 0.1,
      top_p: 1,
      max_tokens: 500, // This is max tokens generated! Because max total token count is 4097, this means that max input is 3597 tokens, i.e. about 7000 characters. 
      frequency_penalty: 0,
      presence_penalty: 0, 
      }).catch(err => {  
          console.log("Error: "+err.stack);
      });  
      if(response.data.choices != null)
      {
        // console.log("Response received:" + response.data.choices[0].message.content);
        var gptresponse = response.data.choices[0].message.content;
        if (prompt.length < GPTprompt.length)
          gptresponse = gptresponse + "*ABR*";
        return gptresponse; 
      }
      else
          return "Error, unexpected response from OpenAI!";   
  }
  catch(error)
  {
      console.log(error.message);
      console.log("OpenAI is probably not working...");
      return "Error from OpenAI!";
  }
}

async function runPrompts(data, filename) {
  var abridgedData = data;
  if (data.length > 32767) {
    // Handle the case where data is too long
    // E.g., truncate or split the data
    abridgedData = data.substring(0,30000); // Truncating as an example
  }
  var responses = [filename, abridgedData];
  for(var i = 0; i < prompts.length; i++){
    console.log("Processing prompt:" + prompts[i]);
    var response = await GPT(prompts[i] + he.encode(data));
    if (response.length > 32767) {
      // Handle the case where data is too long
      // E.g., truncate or split the data
      response = response.substring(0, 30000); // Truncating as an example
  }
    if(response != null)
    {
      console.log("Response: " + response);
      responses.push(response);  
    }
    else
      responses.push(["Error from OpenAI!"]);
    await setTimeout(2000); // Arbitrary 2 second wait to avoid OpenAI freezing up...
  }
  return responses;
}
/*
async function runPrompts(data, filename) {
  var responses ="<Row>";
  var initialInput = '<Cell><Data ss:Type="String">' + he.encode(filename) + '</Data></Cell>' +"/n"+
  '<Cell><Data ss:Type="String">' + he.encode(data) + '</Data></Cell>';
  responses = responses + initialInput;
  for(var i = 0; i < prompts.length; i++){
    console.log("Processing prompt:" + prompts[i]);
    var response = await GPT(prompts[i] + he.encode(data));
    if(response != null)
    {
      console.log("Response: " + response);
      responses = responses + '<Cell><Data ss:Type="String">' + he.encode(response) + '</Data></Cell>';  
    }
    await setTimeout(2000); // Arbitrary 2 second wait to avoid OpenAI freezing up...
  }
  responses = responses + "</Row>";
  console.log("RESPONSES: " + responses);
  return responses;
}
*/

// Process a specific file
async function processFile(file, filePath) {
  if (fs.lstatSync(filePath).isFile()) {
    try {
      if(path.extname(file) === '.txt')
      {
        const data = await fsPromises.readFile(filePath, 'utf8');
        console.log("Textfile, processing prompts!");
        return await runPrompts(data, file);
      }
      else  
        console.log("Not a text file, skipping!");      
    } 
    catch (err) {
      console.error(`Error reading file ${filePath}`, err);
    }
  }
}

// Read the directory
try {
    let wb = XLSX.utils.book_new(); // New workbook
    let wsData = [
        ["Filename", "Content"].concat(prompts),
    ];
  const files = fs.readdirSync(folderName);
  for (const file of files) {
      console.log("Processing file: " + file);
      const filePath = path.join(folderName, file);
      const outputRow = await processFile(file, filePath);
      if (outputRow != null)
       wsData.push(outputRow);
    }
    var folder = folderName;
    if (!folder.endsWith('/')) {
      folder += '/';
    }
    let ws = XLSX.utils.aoa_to_sheet(wsData); // Create a worksheet
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1"); // Append worksheet to workbook
    XLSX.writeFile(wb, folder+'output.xlsx'); // Write workbook to file
  }
  catch (err) {
  console.error('Something happened.', err);
  process.exit(1);
}
