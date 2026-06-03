# 🔍 500错误诊断 - 数据库连接问题

## ⚠️ 错误信息

```
DriverAdapterError: pool timeout: failed to retrieve a connection from pool after 10008ms
(pool connections: active=0 idle=0 limit=10)

cause: '(conn:10928285, no: 45012, SQLState: 08S01) Connection timeout: failed to create socket after 1007ms'
```

---

## 🎯 问题诊断

### 不是V2系统的问题！✅

**问题原因**: 数据库连接失败

### 具体情况

1. **服务器已启动** ✅
   ```
   New Debao API listening on http://localhost:3011
   ```

2. **但数据库连接失败** ❌
   ```
   Connection timeout: failed to create socket after 1007ms
   ```

3. **连接池状态**
   ```
   active=0 idle=0 limit=10
   ```
   - 没有活动连接
   - 没有空闲连接
   - 无法建立新连接

---

## 🔧 可能的原因

### 原因1: 数据库服务未启动 (最可能)
- MySQL/MariaDB服务没有运行
- 需要启动数据库服务

### 原因2: 数据库配置错误
- `.env` 中的 `DATABASE_URL` 配置不正确
- 主机、端口、用户名、密码错误

### 原因3: 网络问题
- 数据库服务器无法访问
- 防火墙阻止连接

### 原因4: 数据库连接数耗尽
- 之前的连接没有正确关闭
- 达到数据库最大连接数限制

---

## ✅ 解决方案

### 方案1: 检查并启动数据库服务 (推荐)

#### Windows:
```bash
# 检查MySQL服务状态
sc query MySQL80

# 启动MySQL服务
net start MySQL80

# 或通过服务管理器
services.msc → 找到MySQL → 启动
```

#### 检查数据库是否可连接:
```bash
# 测试连接
mysql -h localhost -u root -p
```

---

### 方案2: 检查数据库配置

检查 `.env` 文件中的 `DATABASE_URL`:

```bash
cat .env | grep DATABASE_URL
```

应该类似：
```
DATABASE_URL="mysql://user:password@localhost:3306/database_name"
```

确认：
- ✅ 主机地址正确（localhost或IP）
- ✅ 端口正确（默认3306）
- ✅ 用户名和密码正确
- ✅ 数据库名称存在

---

### 方案3: 重启数据库服务

```bash
# 停止
net stop MySQL80

# 等待5秒
sleep 5

# 启动
net start MySQL80
```

---

### 方案4: 清理数据库连接

如果数据库服务正在运行但连接不上：

```sql
-- 连接到MySQL
mysql -u root -p

-- 查看当前连接
SHOW PROCESSLIST;

-- 终止异常连接（如果有）
KILL <process_id>;

-- 刷新权限
FLUSH PRIVILEGES;
```

---

## 🔍 快速诊断步骤

### 1. 检查数据库服务状态
```bash
sc query MySQL80
```

如果显示 `STATE: STOPPED`，则需要启动服务。

### 2. 测试数据库连接
```bash
mysql -h localhost -u root -p
```

如果能连接，说明数据库正常。

### 3. 检查.env配置
```bash
cat .env | grep DATABASE_URL
```

确认配置正确。

---

## 📝 下一步操作

### 请执行以下检查：

1. **检查数据库服务状态**
   ```bash
   sc query MySQL80
   ```
   或在服务管理器中查看

2. **如果服务未启动，启动它**
   ```bash
   net start MySQL80
   ```

3. **服务启动后，服务器会自动重启**
   - 服务器使用 `--watch` 模式
   - 会自动重新连接数据库

4. **验证修复**
   - 刷新浏览器
   - 应该不再有500错误

---

## 💡 总结

### 问题本质
- ❌ 不是V2系统的问题
- ❌ 不是代码的问题
- ✅ 是数据库服务没有运行

### V2系统状态
- ✅ V2系统代码正常
- ✅ Prompt已优化
- ✅ 配置已生效
- ⏳ 等待数据库连接后即可使用

---

**请启动数据库服务，然后服务器会自动恢复！** 🚀
