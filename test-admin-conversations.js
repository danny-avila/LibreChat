/**
 * 测试管理员查看所有用户assistant对话功能
 * 这个脚本用于诊断管理员对话功能为什么不工作
 */
const mongoose = require('mongoose');
const { EModelEndpoint } = require('librechat-data-provider');
const { Conversation, User } = require('./api/db/models');

async function testAdminConversations() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/LibreChat');
    
    console.log('✅ 数据库连接成功\n');

    // 1. 检查assistants对话总数
    const allConvos = await Conversation.countDocuments({});
    console.log(`📊 总对话数: ${allConvos}`);

    // 2. 检查assistants相关的对话
    const assistantQuery = {
      endpoint: { 
        $in: [
          EModelEndpoint.assistants, 
          EModelEndpoint.azureAssistants,
          EModelEndpoint.agents
        ] 
      },
      $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }]
    };

    const assistantConvos = await Conversation.find(assistantQuery)
      .select('conversationId title endpoint user assistant_id agent_id createdAt')
      .limit(20)
      .lean();

    console.log(`\n📝 Assistant/Agent 对话数: ${assistantConvos.length}`);
    
    if (assistantConvos.length > 0) {
      console.log('\n前几个对话:');
      assistantConvos.slice(0, 5).forEach((convo, idx) => {
        console.log(`  ${idx + 1}. ID: ${convo.conversationId}`);
        console.log(`     标题: ${convo.title || '(无标题)'}`);
        console.log(`     端点: ${convo.endpoint}`);
        console.log(`     用户: ${convo.user}`);
        console.log(`     assistant_id: ${convo.assistant_id || '(无)'}`);
        console.log(`     agent_id: ${convo.agent_id || '(无)'}`);
        console.log('');
      });
    }

    // 3. 检查不同endpoint的对话分布
    console.log('\n📈 按endpoint分组统计:');
    const endpoints = ['assistants', 'azureAssistants', 'agents', 'openAI', 'anthropic'];
    for (const endpoint of endpoints) {
      const count = await Conversation.countDocuments({ endpoint });
      if (count > 0) {
        console.log(`  ${endpoint}: ${count}`);
      }
    }

    // 4. 检查有assistant_id或agent_id的对话
    const withAssistantId = await Conversation.countDocuments({ 
      assistant_id: { $exists: true, $ne: null } 
    });
    const withAgentId = await Conversation.countDocuments({ 
      agent_id: { $exists: true, $ne: null } 
    });
    
    console.log(`\n🔍 有assistant_id的对话: ${withAssistantId}`);
    console.log(`🔍 有agent_id的对话: ${withAgentId}`);

    // 5. 检查管理员用户
    const admins = await User.find({ role: 'ADMIN' })
      .select('email username role')
      .lean();
    
    console.log(`\n👑 管理员用户数: ${admins.length}`);
    admins.forEach(admin => {
      console.log(`  - ${admin.email || admin.username} (role: ${admin.role})`);
    });

    // 6. 测试查询逻辑
    console.log('\n🧪 测试查询逻辑:');
    const testQuery = {
      endpoint: { 
        $in: [
          'assistants',
          'azureAssistants',
          'agents'
        ] 
      },
      $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }]
    };
    
    const queryResult = await Conversation.find(testQuery)
      .select('conversationId title endpoint')
      .limit(5)
      .lean();
    
    console.log(`  查询结果数量: ${queryResult.length}`);
    queryResult.forEach((convo, idx) => {
      console.log(`  ${idx + 1}. ${convo.title || '(无标题)'} - ${convo.endpoint}`);
    });

    console.log('\n✅ 测试完成');
    
  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n数据库连接已关闭');
  }
}

testAdminConversations();
