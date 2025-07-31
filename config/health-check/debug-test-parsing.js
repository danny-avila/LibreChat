const { parseAdminEmails } = require('./load-config');

console.log('🧪 Test de Parseo de Emails para Health Check');
console.log('='.repeat(50));

// Casos de prueba
const testCases = [
  'asistente@corporacionccm.cl, email_2@corporacionccm.cl, email_3@corporacionccm.cl',
  'admin@empresa.com,dev@empresa.com,ops@empresa.com',
  'solo@email.com',
  'primero@email.com, segundo@email.com',
  ' espacios@email.com , mas@email.com , final@email.com ',
  '',
  null,
  undefined
];

testCases.forEach((testCase, index) => {
  console.log(`\n📧 Test ${index + 1}:`);
  console.log(`   Input: "${testCase}"`);
  
  const result = parseAdminEmails(testCase);
  
  console.log(`   ✅ Para éxito: "${result.success}"`);
  console.log(`   ❌ Para error: "${result.error}"`);
  console.log(`   📋 Array: [${result.all.join(', ')}]`);
});

console.log('\n🎯 Verificación del comportamiento esperado:');
console.log('✅ Éxito: Solo el primer email');
console.log('❌ Error: Todos los emails unidos por comas');
console.log('📋 Array: Lista completa para referencia');

console.log('\n✅ Test de parseo completado!'); 