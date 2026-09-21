#include <obs-module.h>

#include "member-credits-source.hpp"

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE("member-credits", "en-US")

bool obs_module_load(void)
{
    obs_register_source(&member_credits_source_info);
    blog(LOG_INFO, "member-credits plugin loaded");
    return true;
}

void obs_module_unload(void)
{
    blog(LOG_INFO, "member-credits plugin unloaded");
}
