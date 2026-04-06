package run.halo.moments.vo;

import java.util.List;
import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class MomentPageConfigVo {
    String title;
    Integer pageSize;
    String profileName;
    String signature;
    String avatarUrl;
    String coverUrl;
    String footerText;
    String accentColor;
    List<MomentTagVo> tags;
}
