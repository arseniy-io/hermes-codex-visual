"""Stage a version-pinned Hermes core change for isolated approval tests.

This command only writes to this project's .local folder. It never installs or
restarts Hermes; deployment is a separate, verified step.
"""

from hashlib import sha256
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1]
CORE = Path(os.environ["LOCALAPPDATA"]) / "hermes" / "hermes-agent"
OUT = ROOT / ".local" / "hermes-approval-core"
EXPECTED = {
    "tools/file_tools.py": "2d3aa501b56e62601c2cc2261382d825171d363bb15ee4588807548c47955dac",
    "tools/file_tools_write_guards.py": "343c068928b3d3fe27999b60e4a5cff808a017624c483abbe41429e655a60c77",
    "tools/approval_gateway_wait.py": "4bca92da6a14eedb7eaf1cbd4682f7c88da0cd6292f13d05950e2eb6c2aea410",
    "tools/approval.py": "5652b252e34b632af17df5e372219e6c08713fe9bef6de7179cf61f751bca7ce",
    "gateway/session_ancillary.py": "ae4971eaea3e456d581e0fdd1577b75749ca956384580bf60c7254ed55cabb58",
}


def replace_once(text, old, new):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one matching source section; found {count}.")
    return text.replace(old, new, 1)


def file_tools(text):
    text = replace_once(text,
        'def _write_precheck_error(paths: list[str], content_paths: list[str], task_id: str,\n                          cross_profile: bool) -> str | None:',
        'def _write_precheck_error(paths: list[str], content_paths: list[str], task_id: str,\n                          cross_profile: bool, review_factory=None) -> str | None:')
    text = replace_once(text,
        'return (_check_protected_instruction_write(paths, task_id)\n            or _check_approval_required_write(paths, task_id))',
        'return (_check_protected_instruction_write(paths, task_id, review_factory=review_factory)\n            or _check_approval_required_write(paths, task_id))')
    text = replace_once(text,
        '                    session_id: str | None = None) -> str:\n    """Write content to a file.',
        '                    session_id: str | None = None, approval_reason: str | None = None) -> str:\n    """Write content to a file.')
    text = replace_once(text,
        '    # write_file checks the binary-document guard before the mirror guard.\n    err =',
        '''    review_state = {}
    def review_factory():
        from tools.hcv_approval_preview import prepare_protected_review
        return prepare_protected_review(task_id, [path], [], review_state, mode="write",
                                        path=path, content=content, reason=approval_reason)
    # write_file checks the binary-document guard before the mirror guard.
    err =''')
    text = replace_once(text,
        '           or _check_protected_instruction_write([path], task_id)',
        '           or _check_protected_instruction_write([path], task_id, review_factory=review_factory)')
    text = replace_once(text,
        '            # A whole-file overwrite of content this task never saw, or that\n',
        '''            if review_state:
                from tools.hcv_approval_preview import protected_review_still_matches
                if not protected_review_still_matches(review_state, _get_file_ops(task_id), path_to_resolved, {}):
                    return tool_error("BLOCKED: A file or its path changed after the approval preview. Read it again and request a new review.")
            # A whole-file overwrite of content this task never saw, or that
''')
    text = replace_once(text,
        '               session_id: str | None = None) -> str:\n    """Patch a file using replace mode or V4A patch format.',
        '               session_id: str | None = None, approval_reason: str | None = None) -> str:\n    """Patch a file using replace mode or V4A patch format.')
    text = replace_once(text,
        '    precheck_err = _write_precheck_error(_paths_to_check, _content_write_paths, task_id, cross_profile)',
        '''    review_state = {}
    def review_factory():
        from tools.hcv_approval_preview import prepare_protected_review
        return prepare_protected_review(task_id, _paths_to_check, _entry_paths, review_state,
            mode=mode, path=path, old_string=old_string, new_string=new_string,
            replace_all=replace_all, patch=patch, reason=approval_reason)
    precheck_err = _write_precheck_error(_paths_to_check, _content_write_paths, task_id, cross_profile,
                                         review_factory=review_factory)''')
    text = replace_once(text,
        '            stale_warnings = _edit_warnings(_paths_to_check, _path_to_resolved, task_id)\n',
        '''            if review_state:
                from tools.hcv_approval_preview import protected_review_still_matches
                if not protected_review_still_matches(review_state, _get_file_ops(task_id), _path_to_resolved, _path_to_entry):
                    return tool_error("BLOCKED: A file or its path changed after the approval preview. Read it again and request a new review.")
            stale_warnings = _edit_warnings(_paths_to_check, _path_to_resolved, task_id)
''')
    text = replace_once(text,
        '            "content": {"type": "string", "description": "Complete content to write to the file"},',
        '''            "content": {"type": "string", "description": "Complete content to write to the file"},
            "approval_reason": {"type": "string", "description": "For protected agent instruction files, explain briefly in the user's language why this specific edit is needed."},''')
    text = replace_once(text,
        '            "old_string": {\n                "type": "string",',
        '''            "approval_reason": {"type": "string", "description": "When any file is a protected agent instruction, explain briefly in the user's language why this entire edit is needed."},
            "old_string": {
                "type": "string",''')
    text = replace_once(text,
        '        path=args["path"], content=args["content"], task_id=tid,\n',
        '        path=args["path"], content=args["content"], task_id=tid, approval_reason=args.get("approval_reason"),\n')
    text = replace_once(text,
        '        replace_all=args.get("replace_all", False), patch=args.get("patch"), task_id=tid,\n',
        '        replace_all=args.get("replace_all", False), patch=args.get("patch"), task_id=tid, approval_reason=args.get("approval_reason"),\n')
    return text


def guards(text):
    text = replace_once(text,
        'def _request_protected_instruction_approval(reasons: list[str], task_id: str = "default") -> str | None:',
        'def _request_protected_instruction_approval(reasons: list[str], task_id: str = "default", review_factory=None) -> str | None:')
    text = replace_once(text,
        '        decision = _await_gateway_decision(session_key, notify_cb, approval_data, surface="gateway")',
        '''        if review_factory is not None:
            from tools.approval_context import is_local_interactive_session, is_viewer_turn_with_approver
            if is_local_interactive_session() and is_viewer_turn_with_approver():
                try:
                    approval_data["hcv_review"] = review_factory()
                except Exception as exc:
                    from tools.hcv_approval_preview import ReviewUnavailable
                    detail = str(exc) if isinstance(exc, ReviewUnavailable) else "The preview could not be prepared safely."
                    return "BLOCKED: No approval was requested and no file was changed. " + detail
        decision = _await_gateway_decision(session_key, notify_cb, approval_data, surface="gateway")''')
    text = replace_once(text,
        'def _check_protected_instruction_write(paths: list[str], task_id: str = "default") -> str | None:',
        'def _check_protected_instruction_write(paths: list[str], task_id: str = "default", review_factory=None) -> str | None:')
    text = replace_once(text,
        '    return _request_protected_instruction_approval(reasons, task_id)\n',
        '    return _request_protected_instruction_approval(reasons, task_id, review_factory=review_factory)\n')
    return text


def gateway(text):
    return replace_once(text,
        '            if not preparing_terminal_approval():\n',
        '            if not preparing_terminal_approval() and not approval_data.get("hcv_review"):\n')


def approval(text):
    text = replace_once(text,
        '''        if request_id:
            targets = [entry for entry in queue if entry.data.get("request_id") == request_id]
            if not targets:
                return 0
            queue[:] = [entry for entry in queue if entry not in targets]
        elif resolve_all:
            targets = list(queue)
            queue.clear()
        else:
            targets = [queue.pop(0)]
        if not queue:''',
        '''        if request_id:
            targets = [entry for entry in queue if entry.data.get("request_id") == request_id]
        elif resolve_all:
            targets = list(queue)
        else:
            targets = [queue[0]]
        if choice != "deny":
            targets = [entry for entry in targets if not entry.data.get("hcv_review")
                       or entry.data.get("_hcv_review_seen") is True]
        if not targets:
            return 0
        queue[:] = [entry for entry in queue if entry not in targets]
        if not queue:''')
    text = replace_once(text,
        'def restrict_gateway_approval_card_to_deny(session_key: str, request_id: Optional[str], restricted: bool = True) -> None:',
        '''def mark_gateway_approval_review_seen(session_key: str, request_id: str) -> bool:
    """Mark only a still-pending, complete review in this exact session."""
    with _lock:
        entry = _card_target(session_key, request_id)
        review = entry.data.get("hcv_review") if entry else None
        if not isinstance(review, dict) or review.get("complete") is not True:
            return False
        entry.data["_hcv_review_seen"] = True
        return True


def restrict_gateway_approval_card_to_deny(session_key: str, request_id: Optional[str], restricted: bool = True) -> None:''')
    return text


def ancillary(text):
    text = replace_once(text,
        "    fields = {'session_id', 'profile'} | ({'request_id'} if ack else set())\n",
        "    fields = {'session_id', 'profile'} | ({'request_id'} if ack else {'hcv_seen_request_id'})\n")
    text = replace_once(text,
        '''    return {'approvals': [{'request_id': prompt['prompt_id'], 'command': prompt['command'],
                           'description': prompt['description'], 'choices': list(prompt['choices']),
                           'allow_permanent': 'always' in prompt['choices']} for _, prompt in pending]}''',
        '''    from tools.approval import list_gateway_approvals, mark_gateway_approval_review_seen
    requested = params.get('hcv_seen_request_id')
    review_seen = False
    if requested is not None:
        if not isinstance(requested, str) or not requested:
            raise RuntimeStoreError('invalid_params')
        authorize(connection, ref, params, 'session:approve')
        route = next((route for route, prompt in pending if prompt['prompt_id'] == requested), None)
        review_seen = route is not None and mark_gateway_approval_review_seen(route, requested)
    approvals = []
    for route, prompt in pending:
        item = {'request_id': prompt['prompt_id'], 'command': prompt['command'],
                'description': prompt['description'], 'choices': list(prompt['choices']),
                'allow_permanent': 'always' in prompt['choices']}
        if prompt['description'].startswith('Write to protected agent-instruction file(s): '):
            try:
                matched = [entry for entry in list_gateway_approvals(route)
                           if entry.get('request_id') == prompt['prompt_id']]
                if len(matched) == 1 and 'hcv_review' in matched[0]:
                    item['hcv_review'] = matched[0]['hcv_review']
            except Exception:
                pass  # A failed preview must not break the existing approval queue.
        approvals.append(item)
    return {'approvals': approvals, **({'hcv_review_seen': review_seen} if requested is not None else {})}''')
    return text


def main():
    transformers = {"tools/file_tools.py": file_tools,
                    "tools/file_tools_write_guards.py": guards,
                    "tools/approval_gateway_wait.py": gateway,
                    "tools/approval.py": approval,
                    "gateway/session_ancillary.py": ancillary}
    staged = {}
    for name, digest in EXPECTED.items():
        source = CORE / name
        raw = source.read_bytes()
        if sha256(raw).hexdigest() != digest:
            raise RuntimeError(f"Hermes core changed; refusing to stage an unverified patch: {name}")
        staged[name] = transformers[name](raw.decode("utf-8")).encode("utf-8")
    staged["tools/hcv_approval_preview.py"] = (ROOT / "source/hermes-approval/preview.py").read_bytes()
    for name, raw in staged.items():
        destination = OUT / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        print(f"{name} {sha256(raw).hexdigest()}")
    # A test-only import overlay: untouched modules still come from the pinned
    # installed source, while the four files above come from this directory.
    # The empty main.py satisfies Desktop's source-root probe; Python loads the
    # real hermes_cli package from CORE because this directory has no __init__.
    (OUT / "sitecustomize.py").write_text(
        "import sys\nsys.path.insert(0, " + repr(str(OUT)) + ")\nsys.path.append(" + repr(str(CORE)) + ")\nimport tools, gateway\n", encoding="utf-8")
    (OUT / "tools" / "__init__.py").write_text(
        (CORE / "tools" / "__init__.py").read_text(encoding="utf-8") +
        "\n__path__.append(" + repr(str(CORE / "tools")) + ")\n", encoding="utf-8")
    (OUT / "gateway" / "__init__.py").write_text(
        (CORE / "gateway" / "__init__.py").read_text(encoding="utf-8") +
        "\n__path__.append(" + repr(str(CORE / "gateway")) + ")\n", encoding="utf-8")
    (OUT / "hermes_cli").mkdir(exist_ok=True)
    (OUT / "hermes_cli" / "main.py").write_text("# Desktop source-root probe only.\n", encoding="utf-8")


if __name__ == "__main__":
    main()
