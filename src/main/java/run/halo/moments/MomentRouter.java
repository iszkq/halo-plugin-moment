package run.halo.moments;

import static org.springframework.web.reactive.function.server.RequestPredicates.GET;
import static org.springframework.web.reactive.function.server.RouterFunctions.route;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.annotation.Order;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;

/**
 * Provides a self-contained front-end page for moments so themes no longer need
 * to ship {@code moments.html}.
 */
@Component
public class MomentRouter {
    private static final String ASSET_VERSION = "v1.2.8";
    private static final String APP_HTML = "frontend/moments-app.html";
    private static final String APP_CSS = "frontend/moments-app.css";
    private static final String APP_JS = "frontend/moments-app.js";

    @Bean
    @Order(-100)
    RouterFunction<ServerResponse> momentRouterFunction() {
        return route(GET("/moments")
                .or(GET("/moments/page/{page:\\d+}"))
                .or(GET("/moments/{momentName:^(?!rss\\.xml$).+}")),
                request -> renderPage(APP_HTML))
            .andRoute(GET("/friend-circle")
                    .or(GET("/friend-circle/page/{page:\\d+}"))
                    .or(GET("/friend-circle/{momentName:\\S+}")),
                request -> renderPage(APP_HTML))
            .andRoute(GET("/plugins/moment-circle/view")
                    .or(GET("/plugins/moment-circle/view/page/{page:\\d+}"))
                    .or(GET("/plugins/moment-circle/view/{momentName:\\S+}")),
                request -> renderPage(APP_HTML))
            .andRoute(GET("/plugins/moment-circle/health"),
                request -> ServerResponse.ok()
                    .contentType(MediaType.TEXT_PLAIN)
                    .bodyValue("moment-circle:ok"))
            .andRoute(GET("/plugins/moment-circle/debug/resources"),
                request -> ServerResponse.ok()
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(Map.of(
                        "version", "1.2.8",
                        "htmlExists", classpathResource(APP_HTML).exists(),
                        "cssExists", classpathResource(APP_CSS).exists(),
                        "jsExists", classpathResource(APP_JS).exists(),
                        "assetVersion", ASSET_VERSION
                    )))
            .andRoute(GET("/plugins/moment-circle/static/" + ASSET_VERSION + "/moments-app.css"),
                request -> renderPageAsset(APP_CSS, MediaType.valueOf("text/css")))
            .andRoute(GET("/plugins/moment-circle/static/" + ASSET_VERSION + "/moments-app.js"),
                request -> renderPageAsset(APP_JS, MediaType.valueOf("application/javascript")))
            .andRoute(GET("/plugins/moment-circle/static/moments-app.css"),
                request -> renderPageAsset(APP_CSS, MediaType.valueOf("text/css")))
            .andRoute(GET("/plugins/moment-circle/static/moments-app.js"),
                request -> renderPageAsset(APP_JS, MediaType.valueOf("application/javascript")));
    }

    private Mono<ServerResponse> renderPage(String classpathLocation) {
        return renderResource(classpathLocation, MediaType.TEXT_HTML, CacheControl.noCache());
    }

    private Mono<ServerResponse> renderAsset(String classpathLocation, MediaType mediaType) {
        return renderResource(classpathLocation, mediaType,
            CacheControl.maxAge(Duration.ofDays(30)).cachePublic());
    }

    private Mono<ServerResponse> renderPageAsset(String classpathLocation, MediaType mediaType) {
        return renderResource(classpathLocation, mediaType, CacheControl.noCache());
    }

    private Mono<ServerResponse> renderResource(String classpathLocation, MediaType mediaType,
        CacheControl cacheControl) {
        return Mono.fromCallable(() -> readClasspathResource(classpathLocation))
            .flatMap(content -> ServerResponse.ok()
                .contentType(mediaType)
                .cacheControl(cacheControl)
                .bodyValue(content))
            .onErrorResume(FileNotFoundException.class, ex -> ServerResponse.notFound().build());
    }

    private ClassPathResource classpathResource(String classpathLocation) {
        return new ClassPathResource(classpathLocation, getClass().getClassLoader());
    }

    private String readClasspathResource(String classpathLocation) throws IOException {
        var resource = classpathResource(classpathLocation);
        if (!resource.exists()) {
            throw new FileNotFoundException(classpathLocation);
        }
        try (var inputStream = resource.getInputStream()) {
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
