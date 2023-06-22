export default function getAppTitle(config) {
  // Check if window object is available
  if (typeof window !== 'undefined') { 
    const hostname = window.location.hostname;
        
    // Here you can set conditions to check the specific domain and set the title accordingly
    if (hostname.includes('china.io')) {
      return 'China GPT';
    } else if (hostname.includes('gptusa.io')) {
      return 'UsaGPT';
    } else if (hostname.includes('gptrussia.io')) {
      return 'Russia GPT';
    } else if (hostname.includes('gptitaly.io')) {
      return 'Italy GPT';
    }
  }
  
  return config?.appTitle || 'ChatGPT';
}
  