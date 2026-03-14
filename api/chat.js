const { AzureOpenAI } = require("openai");

// GitHub จะดึงค่าเหล่านี้มาจาก Secrets ที่เราตั้งไว้ใน Step 1
const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_KEY;
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
const apiVersion = "2024-05-01-preview";

const client = new AzureOpenAI({ 
  endpoint, 
  apiKey, 
  apiVersion, 
  deployment 
});
