# Backend Structure Rules (NestJS + Prisma)

Follow these rules exactly. `{object}` is the lowercase name of a domain object and `{Object}` is its PascalCase name.

## 1. One folder per object

Every domain object gets its own folder under `src/`, and all of that object's files live there. Code that several objects share goes in its own folder (for example `auth/`) or at the `src/` root (for example `prisma.ts`). Never put one object's files inside another object's folder.

```
src/
├── main.ts
├── app.module.ts
├── prisma.ts
├── auth/
│   ├── auth.guard.ts
│   ├── auth.module.ts
│   ├── auth.service.ts
│   └── constants.ts
└── {object}/
    ├── dto/
    │   ├── Create{Object}.dto.ts
    │   ├── Edit{Object}.dto.ts
    │   └── Create{Object}Bulk.dto.ts
    ├── {object}.module.ts
    ├── {object}.controller.ts
    ├── {object}.controller.spec.ts
    ├── {object}.service.ts
    ├── {object}.service.spec.ts
    └── {object}.repository.ts
```

## 2. DTO folder (required)

- Every DTO goes in `src/{object}/dto/`. Never in a controller, a service, or a shared DTO folder.
- Name files `{Verb}{Object}.dto.ts` in PascalCase, e.g. `CreateProduct.dto.ts`, `EditProduct.dto.ts`.
- The class name matches the file name without the suffix: `export class CreateProduct`.
- Validate with class-validator decorators, and declare every property with `!:`.
- Field names are snake_case and match the database columns.
- Required fields get `@IsNotEmpty({ message: '...' })` with a readable message. Optional fields get `@IsOptional()`.
- Enums use `@IsEnum(Enum, { message: 'Invalid ...' })`. Dates are strings checked with `@IsDateString()`.
- The Edit DTO extends the Create DTO and adds `id`.
- A Bulk DTO wraps an array of the Create DTO with `@IsArray()`, `@ArrayMinSize(1)`, `@ValidateNested({ each: true })` and `@Type(() => Create{Object})`.

## 3. Controller (routing only)

- Use `@Controller('{plural object}')`.
- Version every route: `'v1'`, `'v1/:id'`, `'v1/bulk-create'`.
- CRUD mapping: `@Post('v1')` creates, `@Get('v1')` lists, `@Patch('v1')` edits (id in the body), `@Delete('v1/:id')` deletes.
- Put `@HttpCode(200)` on every handler.
- Protected handlers use `@UseGuards(AuthGuard)` and read the token with `@Headers('authorization') auth: string`.
- Read bodies with `@Body(ValidationPipe)`, path ids with `@Param('id')`, filters with `@Query('{name}')`.
- A handler's body is one line: `return this.{object}Service.{method}(...)`. No logic, no database calls, no try/catch.

## 4. Service (business logic)

- `@Injectable()`; inject the repository and `AuthService` with `private readonly`.
- Resolve the user id first, from the token: `const authId = await this.authService.verifySessionToken(token.replace('Bearer ', ''))`.
- Never take the user id from the request body. Always use `authId`.
- Write methods return `{ message: '{Object} Successfully {Action}' }`. Read methods return the data, or wrap it in a named key such as `{ items }`.
- Throw NestJS exceptions with clear messages: `BadRequestException`, `NotFoundException`, `UnauthorizedException`.
- Services never touch the database client. They only call the repository.

## 5. Repository (database only)

- `@Injectable() export class {Object}Repository`, importing the shared client from `'../prisma.js'`.
- Wrap creates, updates and deletes in `prisma.$transaction(async (tx) => { ... })`.
- Scope every query to the owner with `where: { user_id: userId }`. Add `id` for single-row actions.
- Reads use `findMany` or `findFirst` with an explicit `select`. Never return whole rows.
- Convert date strings with `new Date(...)` before saving.
- Method names match the service: `create{Object}`, `get{Object}s`, `edit{Object}`, `delete{Object}`.

## 6. Module

- Import `JwtModule.register({ secret: constants.secret })` and `AuthModule`.
- `controllers: [{Object}Controller]`, `providers: [{Object}Service, {Object}Repository, AuthService]`.
- Register the module in `app.module.ts` under `imports`.
- Validation is global in `main.ts`: `app.useGlobalPipes(new ValidationPipe({ transform: true }))`.

## 7. General style

- ESM imports ending in `.js`.
- 4-space indentation. Classes PascalCase, methods and variables camelCase, DTO and database fields snake_case.
- Read config through `process.env['NAME']` with `dotenv/config`. Never hardcode secrets.
- No code comments.

## Request flow

Request → AuthGuard → Controller (DTO validated) → Service (authId from token) → Repository (scoped by user_id) → `{ message }` or data
