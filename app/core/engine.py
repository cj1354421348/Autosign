import httpx
from app.database.models import Task, Log, TaskMode, TaskStatus, TaskResult
from app.database.db import get_session
import re
import traceback
import json

class SignerEngine:
    async def execute_task(self, task_id: str):
        session_gen = get_session()
        session = next(session_gen)
        
        # Init variables for finally block safety
        task = None
        result = False
        output = "Internal logic error (execution did not start)"

        try:
            task = session.get(Task, task_id)
            if not task:
                return

            log = Log(task_id=task.id, status=False, output="Started...")
            session.add(log)
            session.commit()
            session.refresh(log)
            
            # Reset output for actual execution
            output = ""

            try:
                if task.mode == TaskMode.COOKIE:
                    result, output = await self._run_cookie_mode(task)
                elif task.mode == TaskMode.PASSWORD:
                    result, output = await self._run_password_mode(task)
            except Exception as e:
                output = f"Error: {str(e)}\n{traceback.format_exc()}"
                result = False
            
            # Apply Result Regex Filter if configured
            if result and task.config.get("result_regex"):
                 try:
                    regex = task.config.get("result_regex")
                    import re # ensure re is imported or use existing
                    # Using DOTALL to match across newlines if needed, though for JSON usually single line
                    # But re.search is good. Find all groups.
                    matches = re.search(regex, output, re.DOTALL)
                    if matches:
                        # If groups exist, join them. If no groups but match, use full match.
                        if matches.groups():
                            output = " | ".join(matches.groups())
                        else:
                            output = matches.group(0)
                    else:
                        # Append warning but keep original output? Or replace? 
                        # User wants filtering. If not found, maybe just say Not Found to keep it clean?
                        # Or keep original. Linus says "Simple".
                        # Let's append a note so data isn't lost but user knows it failed.
                        output += "\n[Regex Filter] No match found."
                 except Exception as e:
                     output += f"\n[Regex Filter Error] {e}"

            task.last_run = log.timestamp
            task.last_result = TaskResult.SUCCESS if result else TaskResult.FAILURE
            session.add(task)
            
            log.status = result
            log.output = output
            session.add(log) # Update log with filtered output
            session.commit()
            
        except Exception as e:
            print(f"Critical Error in Engine: {e}")
        finally:
            # 4. Notify (Only if task was loaded)
            if task:
                await self._send_notification(task, result, output)
            session.close()

    async def _send_notification(self, task: Task, result: bool, output: str):
        """Sends a notification to the configured Notify Hub"""
        import os
        
        # Configuration
        # Default to localhost:8000 if not set, but user said they handle ports so we trust ENV or default.
        notify_url = os.getenv("NOTIFY_API_URL", "http://127.0.0.1:8000/api/notify")
        notify_key = os.getenv("NOTIFY_KEY", "my-fixed-secret-key-123") # Default from docs/test_api
        
        if not notify_url or not notify_key:
            return 

        level = "success" if result else "error"
        status_text = "Success" if result else "Failed"
        
        # Payload construction matches API_DOCS.md
        # REMOVED TRUNCATION as per user request
        full_content = f"Task: {task.name}\nResult: {status_text}\nOutput: {output}"
        
        payload = {
            "project_name": "CheckIn Tasks", 
            "title": f"Task '{task.name}' {status_text}",
            "content": full_content,
            "level": level
        }
        
        print(f"[Notify] Sending payload with content length: {len(full_content)}")
        
        headers = {
            "X-Project-Key": notify_key,
            "Content-Type": "application/json"
        }
        
        try:
             async with httpx.AsyncClient() as client:
                resp = await client.post(notify_url, json=payload, headers=headers, timeout=5.0)
                if resp.status_code != 200:
                    print(f"[Warn] Notification failed: {resp.status_code} - {resp.text}")
        except Exception as e:
             print(f"[Warn] Notification send error: {e}")

    async def _run_cookie_mode(self, task: Task) -> tuple[bool, str]:
        config = task.config
        url = config.get("signin_url")
        cookie = config.get("cookie")
        method = config.get("method", "GET")
        headers = config.get("headers", {})
        
        if cookie:
            headers["Cookie"] = cookie
        
        async with httpx.AsyncClient() as client:
            try:
                if method.upper() == "POST":
                    resp = await client.post(url, headers=headers)
                else:
                    resp = await client.get(url, headers=headers)
                    
                return resp.status_code < 400, f"Status: {resp.status_code}\nBody: {resp.text[:3000]}"
            except Exception as e:
                return False, str(e)

    async def _run_password_mode(self, task: Task) -> tuple[bool, str]:
        config = task.config
        login_url = config.get("login_url")
        token_rule = config.get("token_extract_rule") 
        login_payload = config.get("login_payload", {})
        login_headers = config.get("login_headers", {})
        
        signin_url = config.get("signin_url")
        signin_headers = config.get("signin_headers", {})
        
        async with httpx.AsyncClient() as client:
            # 1. Login
            try:
                login_resp = await client.post(login_url, json=login_payload, headers=login_headers)
                if login_resp.status_code >= 400:
                    return False, f"Login Failed: {login_resp.status_code}\n{login_resp.text}"
            except Exception as e:
                return False, f"Login Request Error: {e}"
            
            # 2. Extract Token
            token = ""
            if token_rule:
                try:
                    # Support Regex
                    match = re.search(token_rule, login_resp.text)
                    if match:
                        token = match.group(1) if match.groups() else match.group(0)
                    else:
                        # Try parsing as JSON key if regex failed or rule is simple key
                        try:
                            data = login_resp.json()
                            if token_rule in data:
                                token = data[token_rule]
                        except:
                            pass
                            
                    if not token:
                        return False, f"Token extract failed using rule: {token_rule}"
                except Exception as e:
                    return False, f"Token Extraction Error: {e}"
            
            # 3. Signin
            # Replace {token} in headers
            final_headers = {}
            for k, v in signin_headers.items():
                if isinstance(v, str):
                    final_headers[k] = v.replace("{token}", str(token))
                else:
                    final_headers[k] = v
            
            try:
                signin_resp = await client.get(signin_url, headers=final_headers)
                return signin_resp.status_code < 400, f"Signin Status: {signin_resp.status_code}\n{signin_resp.text[:3000]}"
            except Exception as e:
                 return False, f"Signin Request Error: {e}"

engine = SignerEngine()
