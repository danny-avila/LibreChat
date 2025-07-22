const path = require('path');
const fs = require('fs');
require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const { askQuestion, silentExit } = require('./helpers');
const Conversation = require('~/models/schema/convoSchema');
const Message = require('~/models/schema/messageSchema');
const User = require('~/models/User');
const connect = require('./connect');

/**
 * Extrae el texto de los mensajes
 */
function extractTextFromContent(content) {
  if (!content || !Array.isArray(content)) return '';
  return content
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join(' ');
}

/**
 * Limpia el texto para CSV
 */
function cleanTextForCSV(text) {
  if (!text) return '';
  return text
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/"/g, '""')
    .trim();
}

(async () => {
  await connect();

  console.purple('----------------------------------------');
  console.purple('🗂️  Exportar TODAS las Conversaciones');
  console.purple('----------------------------------------');

  let format = process.argv[2] || 'csv';
  let outputFile = process.argv[3];

  // Validar formato
  if (!['csv', 'json'].includes(format.toLowerCase())) {
    console.orange('Uso: npm run export-all-chats [csv|json] [archivo]');
    console.orange('Ejemplo: npm run export-all-chats csv todas_conversaciones.csv');
    format = 'csv';
  }
  format = format.toLowerCase();

  try {
    console.orange('👥 Obteniendo usuarios...');
    const users = await User.find({}, 'email name').lean();
    
    console.orange('📂 Obteniendo todas las conversaciones...');
    const conversations = await Conversation.find({}).sort({ updatedAt: -1 }).lean();
    
    console.orange('💬 Obteniendo todos los mensajes...');
    const messages = await Message.find({}).sort({ createdAt: 1 }).lean();

    console.green(`✅ ${users.length} usuarios, ${conversations.length} conversaciones, ${messages.length} mensajes`);

    // Crear mapas para búsqueda rápida
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = user;
    });

    // Determinar archivo de salida
    if (!outputFile) {
      const timestamp = new Date().toISOString().slice(0, 10);
      // ✅ Si no hay outputFile, usar 'chats.csv' para CSV o el nombre con timestamp para JSON
      outputFile = format === 'csv' ? 'chats.csv' : `todas_conversaciones_${timestamp}.${format}`;
    }

    console.orange('📝 Generando exportación...');

    if (format === 'json') {
      // Generar JSON
      const result = {
        exportDate: new Date().toISOString(),
        totalUsers: users.length,
        totalConversations: conversations.length,
        totalMessages: messages.length,
        users: {}
      };

      // Agrupar por usuario
      conversations.forEach(conv => {
        const user = userMap[conv.user];
        if (!user) return;

        const userEmail = user.email;
        if (!result.users[userEmail]) {
          result.users[userEmail] = {
            userInfo: {
              email: user.email,
              name: user.name || ''
            },
            conversations: []
          };
        }

        const convMessages = messages
          .filter(msg => msg.conversationId === conv.conversationId)
          .map(msg => ({
            messageId: msg.messageId,
            sender: msg.sender || '',
            text: msg.text || extractTextFromContent(msg.content),
            isCreatedByUser: msg.isCreatedByUser || false,
            createdAt: msg.createdAt,
            parentMessageId: msg.parentMessageId || ''
          }));

        result.users[userEmail].conversations.push({
          conversationId: conv.conversationId,
          title: conv.title || 'Sin título',
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: convMessages.length,
          messages: convMessages
        });
      });

      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');

    } else {
      // Generar CSV
      const lines = ['userEmail,userName,conversationId,conversationTitle,sender,text,isCreatedByUser,error,unfinished,messageId,parentMessageId,createdAt'];
      
      conversations.forEach(conv => {
        const user = userMap[conv.user];
        if (!user) return;

        const convMessages = messages.filter(msg => msg.conversationId === conv.conversationId);
        
        convMessages.forEach(msg => {
          let text = msg.text || extractTextFromContent(msg.content);
          text = cleanTextForCSV(text);
          
          const row = [
            user.email,
            `"${cleanTextForCSV(user.name || '')}"`,
            conv.conversationId,
            `"${cleanTextForCSV(conv.title || 'Sin título')}"`,
            msg.sender || '',
            `"${text}"`,
            msg.isCreatedByUser || false,
            msg.error || false,
            msg.unfinished || false,
            msg.messageId,
            msg.parentMessageId || '',
            msg.createdAt ? msg.createdAt.toISOString() : ''
          ];
          lines.push(row.join(','));
        });
      });

      fs.writeFileSync(outputFile, lines.join('\n'), 'utf8');
    }

    // Mostrar resumen
    console.purple('----------------------------------------');
    console.green('✅ ¡Exportación masiva completada!');
    console.purple('----------------------------------------');
    console.cyan(`👥 Total usuarios: ${users.length}`);
    console.cyan(`📊 Total conversaciones: ${conversations.length}`);
    console.cyan(`💬 Total mensajes: ${messages.length}`);
    console.cyan(`📁 Formato: ${format.toUpperCase()}`);
    console.cyan(`💾 Archivo: ${outputFile}`);
    console.cyan(`📅 Fecha: ${new Date().toLocaleString()}`);
    console.purple('----------------------------------------');

    silentExit(0);

  } catch (error) {
    console.red('❌ Error durante la exportación:');
    console.red(error.message);
    silentExit(1);
  }
})();

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('Error inesperado:', err);
    process.exit(1);
  }
}); 