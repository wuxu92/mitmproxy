import logging
import re
import shlex
from collections.abc import Callable
from collections.abc import Sequence

import pyperclip

import mitmproxy.types
from mitmproxy import command
from mitmproxy import ctx
from mitmproxy import exceptions
from mitmproxy import flow
from mitmproxy import http
from mitmproxy.net.http.http1 import assemble
from mitmproxy.utils import strutils


def cleanup_request(f: flow.Flow) -> http.Request:
    if not getattr(f, "request", None):
        raise exceptions.CommandError("Can't export flow with no request.")
    assert isinstance(f, http.HTTPFlow)
    request = f.request.copy()
    request.decode(strict=False)
    return request


def pop_headers(request: http.Request) -> None:
    """Remove some headers that are redundant for curl/httpie export."""
    request.headers.pop("content-length", None)

    if request.headers.get("host", "") == request.host:
        request.headers.pop("host")
    if request.headers.get(":authority", "") == request.host:
        request.headers.pop(":authority")


def cleanup_response(f: flow.Flow) -> http.Response:
    if not getattr(f, "response", None):
        raise exceptions.CommandError("Can't export flow with no response.")
    assert isinstance(f, http.HTTPFlow)
    response = f.response.copy()  # type: ignore
    response.decode(strict=False)
    return response


def request_content_for_console(request: http.Request) -> str:
    try:
        text = request.get_text(strict=True)
        assert text
    except ValueError:
        # shlex.quote doesn't support a bytes object
        # see https://github.com/python/cpython/pull/10871
        raise exceptions.CommandError("Request content must be valid unicode")
    escape_control_chars = {chr(i): f"\\x{i:02x}" for i in range(32)}
    escaped_text = "".join(escape_control_chars.get(x, x) for x in text)
    if any(char in escape_control_chars for char in text):
        # Escaped chars need to be unescaped by the shell to be properly inperpreted by curl and httpie
        return f'"$(printf {shlex.quote(escaped_text)})"'

    return shlex.quote(escaped_text)


def curl_command(f: flow.Flow) -> str:
    request = cleanup_request(f)
    pop_headers(request)

    args = ["curl"]

    server_addr = f.server_conn.peername[0] if f.server_conn.peername else None

    if (
        ctx.options.export_preserve_original_ip
        and server_addr
        and request.pretty_host != server_addr
    ):
        resolve = f"{request.pretty_host}:{request.port}:[{server_addr}]"
        args.append("--resolve")
        args.append(resolve)

    for k, v in request.headers.items(multi=True):
        if k.lower() == "accept-encoding":
            args.append("--compressed")
        else:
            args += ["-H", f"{k}: {v}"]

    if request.method != "GET":
        if not request.content:
            # curl will not calculate content-length if there is no content
            # some server/verb combinations require content-length headers
            # (ex. nginx and POST)
            args += ["-H", "content-length: 0"]

        args += ["-X", request.method]

    args.append(request.pretty_url)

    command = " ".join(shlex.quote(arg) for arg in args)
    if request.content:
        command += f" -d {request_content_for_console(request)}"
    return command


def httpie_command(f: flow.Flow) -> str:
    request = cleanup_request(f)
    pop_headers(request)

    # TODO: Once https://github.com/httpie/httpie/issues/414 is implemented, we
    # should ensure we always connect to the IP address specified in the flow,
    # similar to how it's done in curl_command.
    url = request.pretty_url

    args = ["http", request.method, url]
    for k, v in request.headers.items(multi=True):
        args.append(f"{k}: {v}")
    cmd = " ".join(shlex.quote(arg) for arg in args)
    if request.content:
        cmd += " <<< " + request_content_for_console(request)
    return cmd


def raw_request(f: flow.Flow) -> bytes:
    request = cleanup_request(f)
    if request.raw_content is None:
        raise exceptions.CommandError("Request content missing.")
    return assemble.assemble_request(request)


def raw_response(f: flow.Flow) -> bytes:
    response = cleanup_response(f)
    if response.raw_content is None:
        raise exceptions.CommandError("Response content missing.")
    return assemble.assemble_response(response)


# Request headers whose values are credentials and must never be shared.
REDACT_REQUEST_HEADERS = frozenset(
    [
        "authorization",
        "proxy-authorization",
        "cookie",
        "x-api-key",
        "api-key",
        "x-auth-token",
        "x-amz-security-token",
    ]
)

# Response headers worth keeping; everything else is dropped as noise.
KEEP_RESPONSE_HEADERS = frozenset(
    [
        "content-length",
        "content-type",
    ]
)

# Response headers whose name contains one of these substrings are also kept
# (e.g. request IDs and correlation IDs useful for investigating an issue).
KEEP_RESPONSE_HEADER_PATTERNS = ("request-id", "correlation")

REDACTED = "[REDACTED]"

# Azure subscription IDs are credential-like GUIDs that appear after
# `/subscriptions/` in URLs and as `"subscriptionId": "<guid>"` in bodies.
_SUBSCRIPTION_PATTERNS = [
    re.compile(rb"(?i)(/subscriptions/)[0-9a-f-]{36}"),
    re.compile(rb'(?i)("subscriptionId"\s*:\s*")[0-9a-f-]{36}'),
]


def redact_subscription_ids(data: bytes) -> bytes:
    for pattern in _SUBSCRIPTION_PATTERNS:
        data = pattern.sub(rb"\1" + REDACTED.encode(), data)
    return data


def redact_request(request: http.Request) -> None:
    """Strip credential header values and subscription IDs from a request in place."""
    for name in list(request.headers.keys()):
        if name.lower() in REDACT_REQUEST_HEADERS:
            request.headers[name] = REDACTED
    request.path = redact_subscription_ids(request.path.encode()).decode()
    content = request.content
    if content:
        request.content = redact_subscription_ids(content)


def redact_response(response: http.Response) -> None:
    """Drop noisy/sensitive response headers and subscription IDs in place."""
    for name in list(response.headers.keys()):
        lname = name.lower()
        keep = lname in KEEP_RESPONSE_HEADERS or any(
            p in lname for p in KEEP_RESPONSE_HEADER_PATTERNS
        )
        if not keep:
            del response.headers[name]
    content = response.content
    if content:
        response.content = redact_subscription_ids(content)


def raw_redacted_request(f: flow.Flow) -> bytes:
    request = cleanup_request(f)
    if request.raw_content is None:
        raise exceptions.CommandError("Request content missing.")
    redact_request(request)
    return assemble.assemble_request(request)


def raw_redacted_response(f: flow.Flow) -> bytes:
    response = cleanup_response(f)
    if response.raw_content is None:
        raise exceptions.CommandError("Response content missing.")
    redact_response(response)
    return assemble.assemble_response(response)


def _assemble_raw(
    f: flow.Flow,
    request_fn: Callable[[flow.Flow], bytes],
    response_fn: Callable[[flow.Flow], bytes],
    separator: bytes,
    websocket: bool,
) -> bytes:
    request_present = (
        isinstance(f, http.HTTPFlow) and f.request and f.request.raw_content is not None
    )
    response_present = (
        isinstance(f, http.HTTPFlow)
        and f.response
        and f.response.raw_content is not None
    )

    if request_present and response_present:
        parts = [request_fn(f), response_fn(f)]
        if websocket and isinstance(f, http.HTTPFlow) and f.websocket:
            parts.append(f.websocket._get_formatted_messages())
        return separator.join(parts)
    elif request_present:
        return request_fn(f)
    elif response_present:
        return response_fn(f)
    else:
        raise exceptions.CommandError("Can't export flow with no request or response.")


def raw(f: flow.Flow, separator=b"\r\n\r\n") -> bytes:
    """Return either the request or response if only one exists, otherwise return both"""
    return _assemble_raw(f, raw_request, raw_response, separator, websocket=True)


def raw_redacted(f: flow.Flow, separator=b"\r\n\r\n") -> bytes:
    """Like `raw`, but with credentials and Azure subscription IDs redacted for sharing."""
    return _assemble_raw(
        f, raw_redacted_request, raw_redacted_response, separator, websocket=False
    )


formats: dict[str, Callable[[flow.Flow], str | bytes]] = dict(
    curl=curl_command,
    httpie=httpie_command,
    raw=raw,
    raw_request=raw_request,
    raw_response=raw_response,
    raw_redacted=raw_redacted,
)


class Export:
    def load(self, loader):
        loader.add_option(
            "export_preserve_original_ip",
            bool,
            False,
            """
            When exporting a request as an external command, make an effort to
            connect to the same IP as in the original request. This helps with
            reproducibility in cases where the behaviour depends on the
            particular host we are connecting to. Currently this only affects
            curl exports.
            """,
        )

    @command.command("export.formats")
    def formats(self) -> Sequence[str]:
        """
        Return a list of the supported export formats.
        """
        return list(sorted(formats.keys()))

    @command.command("export.file")
    def file(self, format: str, flow: flow.Flow, path: mitmproxy.types.Path) -> None:
        """
        Export a flow to path.
        """
        if format not in formats:
            raise exceptions.CommandError("No such export format: %s" % format)
        v = formats[format](flow)
        try:
            with open(path, "wb") as fp:
                if isinstance(v, bytes):
                    fp.write(v)
                else:
                    fp.write(v.encode("utf-8", "surrogateescape"))
        except OSError as e:
            logging.error(str(e))

    @command.command("export.clip")
    def clip(self, format: str, f: flow.Flow) -> None:
        """
        Export a flow to the system clipboard.
        """
        content = self.export_str(format, f)
        try:
            pyperclip.copy(content)
        except pyperclip.PyperclipException as e:
            logging.error(str(e))

    @command.command("export")
    def export_str(self, format: str, f: flow.Flow) -> str:
        """
        Export a flow and return the result.
        """
        if format not in formats:
            raise exceptions.CommandError("No such export format: %s" % format)

        content = formats[format](f)
        # The individual formatters may return surrogate-escaped UTF-8, but that may blow up in later steps.
        # For example, pyperclip on macOS does not like surrogates.
        # To fix this, We first surrogate-encode and then backslash-decode.
        content = strutils.always_bytes(content, "utf8", "surrogateescape")
        content = strutils.always_str(content, "utf8", "backslashreplace")
        return content
