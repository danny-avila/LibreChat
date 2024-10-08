
const { format } = require('date-fns'); 

// Replaces the current date server side

function replaceSpecialVars(text) {
    if (!text) {
      return text;
    }
  
    const currentDate = format(new Date(), 'yyyy-MM-dd');
    text = text.replace(/{{current_date}}/gi, currentDate);

    return text;
  }
  
module.exports = replaceSpecialVars;
