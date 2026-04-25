// Jest 测试设置

// 设置超时
jest.setTimeout(30000);

// 测试完成后的清理
afterAll(async () => {
  // 等待一段时间让所有异步操作完成
  await new Promise(resolve => setTimeout(resolve, 200));

  // 强制清理所有定时器
  jest.clearAllTimers();
});
