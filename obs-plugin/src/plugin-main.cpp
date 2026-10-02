#include <obs-module.h>
#include <curl/curl.h>

#include "member-credits-source.hpp"

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("member-credits", "en-US")

bool obs_module_load(void)
{
    if (curl_global_init(CURL_GLOBAL_DEFAULT) != CURLE_OK)
        return false;
    obs_register_source(&member_credits_source_info);
    blog(LOG_INFO, "member-credits plugin loaded");
    return true;
}

void obs_module_unload(void)
{
    curl_global_cleanup();
    blog(LOG_INFO, "member-credits plugin unloaded");
}
