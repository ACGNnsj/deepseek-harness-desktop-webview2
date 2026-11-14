//!DESC Anime4K-push
//!HOOK MAIN
//!BIND HOOKED
//!SAVE PUSH
//!WIDTH HOOKED.w
//!HEIGHT HOOKED.h
//!COMPONENTS 3

vec4 hook() {
    return HOOKED_texOff(0.0);
}
