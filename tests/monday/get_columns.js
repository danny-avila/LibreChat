const MondayTool = require('./../../api/app/clients/tools/structured/MondayTool');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
const tool = new MondayTool({ apiKey });

async function getColumns() {
  try {
    const result = await tool._call({ action: 'getColumnsInfo', boardId: '9261805849' });
    const data = JSON.parse(result);
    console.log('КОЛОНКИ ДОСКИ:');
    data.data.forEach(col => console.log(`ID: ${col.id}, Название: ${col.title}, Тип: ${col.type}`));
  } catch (error) {
    console.error('Ошибка:', error);
  }
}

getColumns(); 