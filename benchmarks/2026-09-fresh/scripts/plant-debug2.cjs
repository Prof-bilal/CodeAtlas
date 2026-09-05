const fs = require("fs");
const p = "01-small-app-debug2/src/services/authService.ts";
let s = fs.readFileSync(p, "utf8");

s = s.replace(
  "import { CreateUserInput, UserModel, UserResponse, toUserResponse } from '../models/user.js';",
  "import { CreateUserInput, UserModel, UserResponse, toUserResponse } from '../models/user.js';\n\n" +
  "// PLANTED DEFECT (DEBUGGING-EXPERT-01): verified-token cache. logout() does NOT\n" +
  "// clear it, so after logout the cached identity is still served for reads.\n" +
  "const verifiedCache = new Map<string, UserModel>();"
);

s = s.replace(
  "  async verifyToken(token: string): Promise<UserModel> {\n    try {\n      const payload = jwt.verify(token, authConfig.jwtSecret) as { userId: string };",
  "  async verifyToken(token: string): Promise<UserModel> {\n" +
  "    const cachedUser = verifiedCache.get(token);\n" +
  "    if (cachedUser) return cachedUser;\n" +
  "    try {\n" +
  "      const payload = jwt.verify(token, authConfig.jwtSecret) as { userId: string };"
);

s = s.replace(
  "      return user;\n    } catch (error) {\n      if (error instanceof AppError) {",
  "      verifiedCache.set(token, user);\n      return user;\n    } catch (error) {\n      if (error instanceof AppError) {"
);

fs.writeFileSync(p, s);
console.log("debug2 planted:", s.includes("verifiedCache"), s.includes("PLANTED DEFECT (DEBUGGING-EXPERT-01)"));