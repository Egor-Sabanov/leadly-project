const assert = require("node:assert/strict");
const path = require("node:path");
const { createTsLoader } = require("./ts-loader.cjs");
const { authErrorMessage, mailWaitSeconds, emailConfirmation, CONFIRMATION_MESSAGE } = createTsLoader()(path.join(__dirname, "../lib/auth-feedback.ts"));
const tests = [];
const test = (name, run) => tests.push([name, run]);
test("unknown provider failures never echo emails, tokens or internals", () => {
  const secret = "email@example.com token_hash=secret SQL database unavailable";
  assert.equal(authErrorMessage(new Error(secret), "signin"), "Не удалось выполнить запрос. Попробуй ещё раз чуть позже.");
  assert.ok(!authErrorMessage({message:secret,code:secret}, "password").includes(secret));
});
test("wrong password and unknown or blocked identity use the same sign-in message", () => {
  const messages = ["invalid_credentials","user_not_found","user_banned"].map(code => authErrorMessage({code}, "signin"));
  assert.equal(new Set(messages).size, 1);
  assert.match(messages[0], /почту и пароль/);
});
test("signup and resend remain neutral for existing and nonexistent identities", () => {
  for (const code of ["user_already_exists","email_exists","user_not_found"])
    for (const action of ["signup","confirm"]) assert.equal(authErrorMessage({code}, action), CONFIRMATION_MESSAGE);
});
test("rate limits use Russian guidance regardless of provider message", () => {
  for (const error of [{status:429},{code:"over_email_send_rate_limit"},{code:"over_request_rate_limit"}])
    assert.match(authErrorMessage(error,"confirm"), /Слишком много попыток/);
});
test("unconfirmed email gives a way to request confirmation again", () => assert.match(authErrorMessage({code:"email_not_confirmed"}, "signin"), /запроси его повторно/));
test("password requirements and reuse have understandable guidance", () => {
  assert.match(authErrorMessage({code:"weak_password"},"signup"), /8 символов/);
  assert.match(authErrorMessage({code:"same_password"},"password"), /отличаться/);
});
test("expired tokens and PKCE failures do not expose credential details", () => {
  for (const code of ["otp_expired","bad_code_verifier","flow_state_expired","session_not_found","refresh_token_already_used"])
    assert.match(authErrorMessage({code},"confirm"), /Запроси новое письмо/);
});
test("mail wait expires, rounds up, and rejects broken storage values", () => {
  assert.equal(mailWaitSeconds(100001,100000),1);
  assert.equal(mailWaitSeconds(100000,100000),0);
  for (const value of [NaN, Infinity,"broken",-1]) assert.equal(mailWaitSeconds(value,100000),0);
  assert.equal(mailWaitSeconds("160000",100000),60);
  assert.equal(mailWaitSeconds(9999999999999,100000),60);
});
test("email confirmation accepts only supported token types and bounded credentials", () => {
  const hash="a".repeat(64);
  for (const type of ["signup","recovery","email"]) assert.equal(emailConfirmation(hash,type).type,type);
  for (const type of ["magiclink","invite","email_change","https://evil.example",undefined]) assert.equal(emailConfirmation(hash,type),null);
  for (const value of [undefined,[],"a", "a".repeat(257),"https://evil.example/"+hash,hash+"<>"]) assert.equal(emailConfirmation(value,"signup"),null);
});
const {oauthFailurePath,PROVIDER_EMAIL_NOTICE}=createTsLoader()(path.join(__dirname,'../lib/oauth-callback.ts'));
test('unverified social email opens confirmation instead of claiming cancellation',()=>{
 for(const code of ['provider_email_needs_verification','email_not_confirmed']) assert.equal(oauthFailurePath(code),'/auth?error=email_verification&mode=confirm');
 assert.match(PROVIDER_EMAIL_NOTICE,/снова нажми кнопку своего сервиса/);
});
test('unknown callback reasons never echo codes, addresses or arbitrary next destinations',()=>{
 for(const value of [null,undefined,{},'access_denied','https://evil.example','private@example.com','state=secret'])assert.equal(oauthFailurePath(value),'/auth?error=oauth');
});
test('callback email notice does not promise successful login or require a password',()=>{
 assert.match(PROVIDER_EMAIL_NOTICE,/Подтверди почту/);assert.match(PROVIDER_EMAIL_NOTICE,/запроси его повторно/);assert.ok(!PROVIDER_EMAIL_NOTICE.includes('пароль'));assert.ok(!PROVIDER_EMAIL_NOTICE.includes('отменён'));
});
let failed=0;
for (const [name, run] of tests) { try {run(); console.log("PASS "+name);} catch(e) {failed++;console.error("FAIL "+name+": "+e.message);} }
console.log(`RESULT ${tests.length-failed}/${tests.length} auth-completion checks passed`);
if(failed) process.exitCode=1;
