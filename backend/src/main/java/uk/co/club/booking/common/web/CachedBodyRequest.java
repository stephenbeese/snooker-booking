package uk.co.club.booking.common.web;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/**
 * A request whose body can be read more than once.
 *
 * <p>Needed because {@link RateLimitFilter} has to look at the email in the body to apply a
 * per-account limit, and a servlet input stream is single-use: whoever reads it first gets
 * the bytes and everyone after gets nothing. Without this the controller would receive an
 * empty body and every throttled endpoint would fail validation instead of working.
 *
 * <p>Spring's own {@code ContentCachingRequestWrapper} does not solve this. It records bytes
 * as they pass through for logging after the fact, but it does not replay them to a second
 * reader — the caching is a tee, not a buffer.
 *
 * <p>The body is read fully into memory, which is safe only because this wrapper is applied
 * to small JSON auth requests. It must not be put in front of a file upload.
 */
class CachedBodyRequest extends HttpServletRequestWrapper {

    private final byte[] body;

    CachedBodyRequest(HttpServletRequest request) throws IOException {
        super(request);
        this.body = request.getInputStream().readAllBytes();
    }

    byte[] body() {
        return body;
    }

    @Override
    public ServletInputStream getInputStream() {
        ByteArrayInputStream buffer = new ByteArrayInputStream(body);
        return new ServletInputStream() {
            @Override
            public int read() {
                return buffer.read();
            }

            @Override
            public boolean isFinished() {
                return buffer.available() == 0;
            }

            @Override
            public boolean isReady() {
                return true;
            }

            @Override
            public void setReadListener(ReadListener listener) {
                // Only meaningful for async reads. Jackson reads this synchronously, and
                // throwing here would break that path for no benefit.
                throw new UnsupportedOperationException("Async reads are not supported");
            }
        };
    }

    @Override
    public BufferedReader getReader() {
        Charset charset = getCharacterEncoding() == null
                ? StandardCharsets.UTF_8
                : Charset.forName(getCharacterEncoding());
        return new BufferedReader(new InputStreamReader(new ByteArrayInputStream(body), charset));
    }
}
