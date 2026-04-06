package run.halo.moments;

import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import lombok.RequiredArgsConstructor;
import org.springdoc.webflux.core.fn.SpringdocRouteBuilder;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;
import run.halo.app.core.extension.endpoint.CustomEndpoint;
import run.halo.app.extension.GroupVersion;
import run.halo.app.extension.ListResult;
import run.halo.app.plugin.ReactiveSettingFetcher;
import run.halo.moments.exception.NotFoundException;
import run.halo.moments.finders.MomentFinder;
import run.halo.moments.finders.MomentPublicQueryService;
import run.halo.moments.vo.MomentPageConfigVo;
import run.halo.moments.vo.MomentVo;

import static org.springdoc.core.fn.builders.apiresponse.Builder.responseBuilder;
import static org.springdoc.core.fn.builders.parameter.Builder.parameterBuilder;

/**
 * Endpoint for moment query.
 *
 */
@Component
@RequiredArgsConstructor
public class MomentQueryEndpoint implements CustomEndpoint {

    private final MomentFinder momentFinder;

    private final MomentPublicQueryService momentPublicQueryService;

    private final ReactiveSettingFetcher settingFetcher;

    @Override
    public RouterFunction<ServerResponse> endpoint() {
        final var tag = "api.moment.halo.run/v1alpha1/Moment";
        return SpringdocRouteBuilder.route()
            .GET("page-config", this::getPageConfig,
                builder -> builder.operationId("queryMomentPageConfig")
                    .description("Gets front-end page configuration for moments.")
                    .tag(tag)
                    .response(responseBuilder()
                        .implementation(MomentPageConfigVo.class)
                    )
            )
            .GET("moments", this::listMoments,
                builder -> {
                    builder.operationId("queryMoments")
                        .description("Lists moments.")
                        .tag(tag)
                        .response(responseBuilder()
                            .implementation(ListResult.generateGenericClass(MomentVo.class))
                        );
                    MomentPublicQuery.buildParameters(builder);
                }
            )
            .GET("moments/{name}", this::getMomentByName,
                builder -> builder.operationId("queryMomentByName")
                    .description("Gets a moment by name.")
                    .tag(tag)
                    .parameter(parameterBuilder()
                        .in(ParameterIn.PATH)
                        .name("name")
                        .description("Moment name")
                        .required(true)
                    )
                    .response(responseBuilder()
                        .implementation(MomentVo.class)
                    )
            )
            .build();
    }

    private Mono<ServerResponse> getPageConfig(ServerRequest request) {
        return Mono.zip(
                settingFetcher.get("base").defaultIfEmpty(JsonNodeFactory.instance.objectNode()),
                settingFetcher.get("profile").defaultIfEmpty(JsonNodeFactory.instance.objectNode()),
                momentFinder.listAllTags().collectList())
            .map(tuple -> {
                var base = tuple.getT1();
                var profile = tuple.getT2();
                return MomentPageConfigVo.builder()
                    .title(base.path("title").asText("瞬间"))
                    .pageSize(base.path("pageSize").asInt(10))
                    .profileName(profile.path("profileName").asText("恪勤"))
                    .signature(profile.path("signature").asText("记录日常、碎片灵感和生活感受。"))
                    .avatarUrl(profile.path("avatarUrl").asText(""))
                    .coverUrl(profile.path("coverUrl").asText(""))
                    .footerText(profile.path("footerText").asText("由 Halo 瞬间插件驱动"))
                    .accentColor(profile.path("accentColor").asText("#07c160"))
                    .tags(tuple.getT3())
                    .build();
            })
            .switchIfEmpty(Mono.just(MomentPageConfigVo.builder().build()))
            .flatMap(config -> ServerResponse.status(HttpStatus.OK)
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(config)
            );
    }

    private Mono<ServerResponse> getMomentByName(ServerRequest request) {
        final var name = request.pathVariable("name");
        return momentFinder.get(name)
            .switchIfEmpty(Mono.error(() -> new NotFoundException("Moment not found")))
            .flatMap(moment -> ServerResponse.ok().contentType(MediaType.APPLICATION_JSON)
                .bodyValue(moment)
            );
    }

    private Mono<ServerResponse> listMoments(ServerRequest request) {
        MomentPublicQuery query = new MomentPublicQuery(request.exchange());
        return momentPublicQueryService.list(query.toListOptions(), query.toPageRequest())
            .flatMap(result -> ServerResponse.ok().contentType(MediaType.APPLICATION_JSON)
                .bodyValue(result)
            );
    }

    @Override
    public GroupVersion groupVersion() {
        return GroupVersion.parseAPIVersion("api.moment.halo.run/v1alpha1");
    }
}
