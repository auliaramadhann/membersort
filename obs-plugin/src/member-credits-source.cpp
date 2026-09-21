#include "member-credits-source.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <cstdlib>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

#include <ft2build.h>
#include FT_FREETYPE_H

#include <obs-module.h>
#include <graphics/graphics.h>

namespace {

constexpr uint32_t kCanvasWidth = 1920;
constexpr uint32_t kCanvasHeight = 1080;
constexpr int kDefaultFontSize = 34;
constexpr int kDefaultRollDuration = 45;
constexpr int kTickerPadding = 72;
constexpr int kTickerHeight = 112;
constexpr const char *kAuthUrl = "http://localhost:8787/auth/google";

struct text_line {
    std::string value;
    int size = kDefaultFontSize;
    uint32_t color = 0x292824;
    int gap_before = 0;
    bool heading = false;
};

struct member_credits_data {
    obs_source_t *source = nullptr;
    std::string title = "Special Thanks";
    std::string kicker = "MEMBER ROLL CALL";
    std::string footer = "Thank you for keeping this channel alive.";
    std::string members =
        "[Founding Supporters]\n"
        "Astra Nox\n"
        "Mio Kisaragi\n\n"
        "[Moonlight Members]\n"
        "Kuma\n"
        "RinSora\n"
        "NeonMikan\n\n"
        "[Starlight Members]\n"
        "Bubu Boba\n"
        "Fia\n"
        "YukiTan";
    std::string roster_file;
    std::string font_path;
    std::string layout_mode = "credit-roll";
    std::string text_align = "center";
    int font_size = kDefaultFontSize;
    int speed = kDefaultRollDuration;
    uint32_t accent = 0xFF91A88B;
    uint32_t text_color = 0xFF292824;
    uint32_t footer_color = 0xFF6C6A62;
    uint32_t background = 0xFFFAF9F5;
    bool transparent_background = false;
    bool playing = true;
    bool dirty = true;
    float elapsed = 0.0f;
    float scroll_y = static_cast<float>(kCanvasHeight);
    float scroll_x = static_cast<float>(kCanvasWidth);
    uint32_t content_width = kCanvasWidth;
    uint32_t content_height = kCanvasHeight;
    std::vector<uint8_t> pixels;
    gs_texture_t *texture = nullptr;
    std::filesystem::file_time_type roster_mtime{};
    bool roster_file_loaded = false;
    FT_Library freetype = nullptr;
    FT_Face face = nullptr;
    bool render_logged = false;
    bool tick_logged = false;
};

void reset_animation(member_credits_data *credits, bool autoplay)
{
    if (!credits)
        return;

    credits->elapsed = 0.0f;
    credits->scroll_y = static_cast<float>(kCanvasHeight);
    credits->scroll_x = static_cast<float>(kCanvasWidth);
    credits->playing = autoplay;
}

bool is_ticker(const member_credits_data *credits)
{
    return credits && credits->layout_mode == "bottom-ticker";
}

const char *member_credits_get_name(void *)
{
    return obs_module_text("Member Credits");
}

uint32_t rgb_color(uint32_t color)
{
    // OBS color properties may include an alpha byte in the high bits.
    return color & 0x00FFFFFF;
}

uint32_t channel(uint32_t color, int shift)
{
    return (rgb_color(color) >> shift) & 0xFF;
}

uint32_t next_codepoint(std::string_view text, size_t &index)
{
    const uint8_t first = static_cast<uint8_t>(text[index]);
    if (first < 0x80) {
        ++index;
        return first;
    }

    size_t length = 0;
    uint32_t codepoint = 0;
    if ((first & 0xE0) == 0xC0) {
        length = 2;
        codepoint = first & 0x1F;
    } else if ((first & 0xF0) == 0xE0) {
        length = 3;
        codepoint = first & 0x0F;
    } else if ((first & 0xF8) == 0xF0) {
        length = 4;
        codepoint = first & 0x07;
    } else {
        ++index;
        return first;
    }

    if (index + length > text.size()) {
        ++index;
        return first;
    }

    for (size_t offset = 1; offset < length; ++offset) {
        const uint8_t byte = static_cast<uint8_t>(text[index + offset]);
        if ((byte & 0xC0) != 0x80) {
            ++index;
            return first;
        }
        codepoint = (codepoint << 6) | (byte & 0x3F);
    }

    const bool overlong =
        (length == 2 && codepoint < 0x80) ||
        (length == 3 && codepoint < 0x800) ||
        (length == 4 && codepoint < 0x10000);
    if (overlong || codepoint > 0x10FFFF || (codepoint >= 0xD800 && codepoint <= 0xDFFF)) {
        ++index;
        return first;
    }

    index += length;
    return codepoint;
}

void set_pixel(member_credits_data *credits, int x, int y, uint32_t color, uint8_t alpha)
{
    if (x < 0 || y < 0 || x >= static_cast<int>(credits->content_width) ||
        y >= static_cast<int>(credits->content_height) || alpha == 0) {
        return;
    }

    const size_t index = (static_cast<size_t>(y) * credits->content_width + x) * 4;
    const uint32_t source_alpha = alpha;
    const uint32_t destination_alpha = credits->pixels[index + 3];
    const uint32_t output_alpha = source_alpha +
                                   (destination_alpha * (255 - source_alpha)) / 255;

    if (output_alpha == 0)
        return;

    const auto blend = [&](int shift) {
        const uint32_t source = channel(color, shift);
        const size_t channel_index = shift == 16 ? 0 : shift == 8 ? 1 : 2;
        const uint32_t destination = credits->pixels[index + channel_index];
        return static_cast<uint8_t>(
            (source * source_alpha + destination * destination_alpha * (255 - source_alpha) / 255) /
            output_alpha
        );
    };

    credits->pixels[index] = blend(16);
    credits->pixels[index + 1] = blend(8);
    credits->pixels[index + 2] = blend(0);
    credits->pixels[index + 3] = static_cast<uint8_t>(output_alpha);
}

int measure_text(FT_Face face, std::string_view text)
{
    int width = 0;
    size_t index = 0;
    while (index < text.size()) {
        const FT_ULong codepoint = next_codepoint(text, index);
        if (FT_Load_Char(face, codepoint, FT_LOAD_DEFAULT) != 0)
            continue;
        width += static_cast<int>(face->glyph->advance.x >> 6);
    }
    return width;
}

void draw_text(member_credits_data *credits, const text_line &line, int baseline)
{
    if (!credits->face || line.value.empty())
        return;

    FT_Set_Pixel_Sizes(credits->face, 0, static_cast<FT_UInt>(line.size));
    const int width = measure_text(credits->face, line.value);
    const int margin = is_ticker(credits) ? kTickerPadding : 80;
    int cursor_x = margin;
    if (credits->text_align == "right")
        cursor_x = static_cast<int>(credits->content_width) - margin - width;
    else if (credits->text_align == "center")
        cursor_x = (static_cast<int>(credits->content_width) - width) / 2;
    cursor_x = std::max(cursor_x, 0);

    size_t index = 0;
    while (index < line.value.size()) {
        const FT_ULong codepoint = next_codepoint(line.value, index);
        if (FT_Load_Char(credits->face, codepoint, FT_LOAD_RENDER) != 0)
            continue;

        const FT_GlyphSlot glyph = credits->face->glyph;
        for (int row = 0; row < glyph->bitmap.rows; ++row) {
            for (int column = 0; column < glyph->bitmap.width; ++column) {
                const uint8_t alpha = glyph->bitmap.buffer[
                    row * glyph->bitmap.pitch + column
                ];
                set_pixel(
                    credits,
                    cursor_x + glyph->bitmap_left + column,
                    baseline - glyph->bitmap_top + row,
                    line.color,
                    alpha
                );
            }
        }
        cursor_x += static_cast<int>(glyph->advance.x >> 6);
    }
}

bool load_roster_file(member_credits_data *credits)
{
    if (!credits || credits->roster_file.empty())
        return false;

    std::error_code filesystem_error;
    const auto modified = std::filesystem::last_write_time(credits->roster_file, filesystem_error);
    if (filesystem_error ||
        (credits->roster_file_loaded && modified == credits->roster_mtime)) {
        return false;
    }

    std::ifstream file(credits->roster_file, std::ios::binary);
    if (!file)
        return false;

    std::string roster{
        std::istreambuf_iterator<char>(file),
        std::istreambuf_iterator<char>()
    };
    if (roster.empty())
        return false;

    if (roster.size() >= 3 && static_cast<uint8_t>(roster[0]) == 0xEF &&
        static_cast<uint8_t>(roster[1]) == 0xBB && static_cast<uint8_t>(roster[2]) == 0xBF) {
        roster.erase(0, 3);
    }

    credits->members = std::move(roster);
    credits->roster_mtime = modified;
    credits->roster_file_loaded = true;
    return true;
}

std::string default_roster_path()
{
    char *path = obs_module_config_path("member-roster.txt");
    if (!path)
        return {};

    std::string result = path;
    bfree(path);
    return result;
}

std::string find_font_path(const std::string &configured_path)
{
    if (!configured_path.empty() && std::filesystem::exists(configured_path))
        return configured_path;

#ifdef _WIN32
    const std::vector<std::string> candidates = {
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
    };
#elif __APPLE__
    const std::vector<std::string> candidates = {
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
    };
#else
    const std::vector<std::string> candidates = {
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    };
#endif

    for (const auto &candidate : candidates) {
        if (std::filesystem::exists(candidate))
            return candidate;
    }
    return {};
}

void load_font(member_credits_data *credits)
{
    if (credits->face) {
        FT_Done_Face(credits->face);
        credits->face = nullptr;
    }
    if (!credits->freetype)
        FT_Init_FreeType(&credits->freetype);

    if (!credits->freetype)
        return;

    const std::string font_path = find_font_path(credits->font_path);
    if (font_path.empty())
        return;

    const FT_Error error = FT_New_Face(credits->freetype, font_path.c_str(), 0, &credits->face);
    blog(
        LOG_INFO,
        "member-credits: font=%s load=%s",
        font_path.c_str(),
        error == 0 ? "ok" : "failed"
    );
}

std::vector<text_line> make_lines(const member_credits_data *credits)
{
    std::vector<text_line> lines;
    lines.push_back({credits->title, credits->font_size + 22, credits->accent, 0, true});
    lines.push_back({credits->kicker, 14, credits->accent, 20, true});
    lines.push_back({"", 1, credits->text_color, 22, false});

    std::string current;
    for (size_t index = 0; index <= credits->members.size(); ++index) {
        const bool end = index == credits->members.size();
        const char character = end ? '\n' : credits->members[index];
        if (character != '\n') {
            current += character;
            continue;
        }

        if (!current.empty() && current.front() == '[' && current.back() == ']') {
            lines.push_back({
                current.substr(1, current.size() - 2),
                15,
                credits->accent,
                25,
                true,
            });
        } else if (!current.empty()) {
            lines.push_back({current, credits->font_size, credits->text_color, 4, false});
        } else {
            lines.push_back({"", 1, credits->text_color, 15, false});
        }
        current.clear();
    }

    lines.push_back({"", 1, credits->text_color, 24, false});
    lines.push_back({credits->footer, 19, credits->footer_color, 10, false});
    return lines;
}

std::string make_ticker_text(const member_credits_data *credits)
{
    std::string ticker;
    size_t start = 0;
    while (start <= credits->members.size()) {
        const size_t end = credits->members.find('\n', start);
        const size_t length = end == std::string::npos ? std::string::npos : end - start;
        std::string line = credits->members.substr(start, length);
        while (!line.empty() && (line.back() == '\r' || line.back() == ' ' || line.back() == '\t'))
            line.pop_back();
        const size_t first = line.find_first_not_of(" \t");
        if (first != std::string::npos)
            line.erase(0, first);

        const bool tier_heading = line.size() >= 2 && line.front() == '[' && line.back() == ']';
        if (!line.empty() && !tier_heading) {
            if (!ticker.empty())
                ticker += "  |  ";
            ticker += line;
        }

        if (end == std::string::npos)
            break;
        start = end + 1;
    }
    return ticker;
}

void rebuild_pixels(member_credits_data *credits)
{
    if (!credits->face)
        load_font(credits);
    if (!credits->face)
        return;

    if (is_ticker(credits)) {
        const std::string ticker = make_ticker_text(credits);
        FT_Set_Pixel_Sizes(credits->face, 0, static_cast<FT_UInt>(credits->font_size));
        const int ticker_width = measure_text(credits->face, ticker);
        credits->content_width = std::max(
            kCanvasWidth,
            static_cast<uint32_t>(ticker_width + kTickerPadding * 2)
        );
        credits->content_height = std::max(
            static_cast<uint32_t>(kTickerHeight),
            static_cast<uint32_t>(credits->font_size + 48)
        );
        credits->pixels.assign(
            static_cast<size_t>(credits->content_width) * credits->content_height * 4,
            0
        );

        if (!credits->transparent_background) {
            for (size_t index = 0; index < credits->pixels.size(); index += 4) {
                credits->pixels[index] = static_cast<uint8_t>(channel(credits->background, 16));
                credits->pixels[index + 1] = static_cast<uint8_t>(channel(credits->background, 8));
                credits->pixels[index + 2] = static_cast<uint8_t>(channel(credits->background, 0));
                credits->pixels[index + 3] = 255;
            }
        }

        draw_text(
            credits,
            {ticker, credits->font_size, credits->text_color, 0, false},
            static_cast<int>(credits->content_height / 2 + credits->font_size / 2 - 4)
        );
        credits->dirty = true;
        return;
    }

    credits->content_width = kCanvasWidth;
    const std::vector<text_line> lines = make_lines(credits);
    uint32_t height = 80;
    for (const text_line &line : lines)
        height += static_cast<uint32_t>(line.size + line.gap_before + 14);

    credits->content_height = std::max(height, 1u);
    credits->pixels.assign(static_cast<size_t>(kCanvasWidth) * credits->content_height * 4, 0);

    if (!credits->transparent_background) {
        for (size_t index = 0; index < credits->pixels.size(); index += 4) {
            credits->pixels[index] = static_cast<uint8_t>(channel(credits->background, 16));
            credits->pixels[index + 1] = static_cast<uint8_t>(channel(credits->background, 8));
            credits->pixels[index + 2] = static_cast<uint8_t>(channel(credits->background, 0));
            credits->pixels[index + 3] = 255;
        }
    }

    int baseline = 70;
    for (const text_line &line : lines) {
        baseline += line.gap_before + line.size;
        draw_text(credits, line, baseline);
        baseline += 14;
    }
    credits->dirty = true;
}

void destroy_texture(member_credits_data *credits)
{
    if (!credits->texture)
        return;

    gs_texture_destroy(credits->texture);
    credits->texture = nullptr;
}

void upload_texture(member_credits_data *credits)
{
    if (credits->pixels.empty())
        rebuild_pixels(credits);
    if (credits->pixels.empty())
        return;

    destroy_texture(credits);
    credits->texture = gs_texture_create(
        credits->content_width,
        credits->content_height,
        GS_RGBA,
        1,
        nullptr,
        GS_DYNAMIC
    );
    if (credits->texture) {
        gs_texture_set_image(
            credits->texture,
            credits->pixels.data(),
            credits->content_width * 4,
            false
        );
        credits->dirty = false;
        if (!credits->render_logged) {
            blog(
                LOG_INFO,
                "member-credits: texture=%ux%u pixels=%zu",
                credits->content_width,
                credits->content_height,
                credits->pixels.size()
            );
        }
    }
}

void member_credits_update(void *data, obs_data_t *settings)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (!credits)
        return;

    const char *title = obs_data_get_string(settings, "title");
    const char *kicker = obs_data_get_string(settings, "kicker");
    const char *footer = obs_data_get_string(settings, "footer");
    const char *members = obs_data_get_string(settings, "members");
    const char *font_path = obs_data_get_string(settings, "font_path");
    const char *layout_mode = obs_data_get_string(settings, "layout_mode");
    const char *text_align = obs_data_get_string(settings, "text_align");
    if (title)
        credits->title = title;
    if (kicker && (obs_data_has_user_value(settings, "kicker") ||
                   obs_data_has_default_value(settings, "kicker")))
        credits->kicker = kicker;
    if (footer)
        credits->footer = footer;
    if (members)
        credits->members = members;
    const char *roster_file = obs_data_get_string(settings, "roster_file");
    credits->roster_file = roster_file && *roster_file ? roster_file : default_roster_path();
    load_roster_file(credits);
    if (font_path)
        credits->font_path = font_path;
    if (layout_mode && *layout_mode)
        credits->layout_mode = layout_mode;
    if (text_align && *text_align)
        credits->text_align = text_align;

    credits->font_size = static_cast<int>(obs_data_get_int(settings, "font_size"));
    credits->speed = static_cast<int>(obs_data_get_int(settings, "speed"));
    credits->accent = obs_data_get_int(settings, "accent");
    credits->text_color = obs_data_get_int(settings, "text_color");
    credits->footer_color = obs_data_get_int(settings, "footer_color");
    credits->background = obs_data_get_int(settings, "background");
    credits->transparent_background = obs_data_get_bool(settings, "transparent_background");
    credits->dirty = true;
    load_font(credits);
    reset_animation(credits, credits->source && obs_source_showing(credits->source));
}

void *member_credits_create(obs_data_t *settings, obs_source_t *source)
{
    auto *credits = new member_credits_data();
    credits->source = source;
    member_credits_update(credits, settings);
    return credits;
}

void member_credits_destroy(void *data)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (!credits)
        return;

    obs_enter_graphics();
    destroy_texture(credits);
    obs_leave_graphics();
    if (credits->face)
        FT_Done_Face(credits->face);
    if (credits->freetype)
        FT_Done_FreeType(credits->freetype);
    delete credits;
}

void member_credits_save(void *data, obs_data_t *settings)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (!credits || !settings)
        return;

    obs_data_set_string(settings, "kicker", credits->kicker.c_str());
    obs_data_set_string(settings, "title", credits->title.c_str());
    obs_data_set_string(settings, "footer", credits->footer.c_str());
    obs_data_set_string(settings, "members", credits->members.c_str());
    obs_data_set_string(settings, "roster_file", credits->roster_file.c_str());
    obs_data_set_string(settings, "font_path", credits->font_path.c_str());
    obs_data_set_string(settings, "layout_mode", credits->layout_mode.c_str());
    obs_data_set_string(settings, "text_align", credits->text_align.c_str());
    obs_data_set_int(settings, "font_size", credits->font_size);
    obs_data_set_int(settings, "speed", credits->speed);
    obs_data_set_int(settings, "accent", credits->accent);
    obs_data_set_int(settings, "text_color", credits->text_color);
    obs_data_set_int(settings, "footer_color", credits->footer_color);
    obs_data_set_int(settings, "background", credits->background);
    obs_data_set_bool(settings, "transparent_background", credits->transparent_background);
}

uint32_t member_credits_get_width(void *)
{
    return kCanvasWidth;
}

uint32_t member_credits_get_height(void *)
{
    return kCanvasHeight;
}

bool member_credits_play(obs_properties_t *, obs_property_t *, void *data)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (!credits)
        return false;

    if (credits->elapsed >= static_cast<float>(std::max(credits->speed, 1)))
        reset_animation(credits, true);
    else
        credits->playing = true;
    return false;
}

bool member_credits_pause(obs_properties_t *, obs_property_t *, void *data)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (credits)
        credits->playing = false;
    return false;
}

bool member_credits_stop(obs_properties_t *, obs_property_t *, void *data)
{
    reset_animation(static_cast<member_credits_data *>(data), false);
    return false;
}

bool member_credits_reset_play(obs_properties_t *, obs_property_t *, void *data)
{
    reset_animation(static_cast<member_credits_data *>(data), true);
    return false;
}

bool member_credits_connect_youtube(obs_properties_t *, obs_property_t *, void *)
{
    std::thread([] {
#ifdef _WIN32
        std::system("start \"\" \"http://localhost:8787/auth/google\"");
#elif __APPLE__
        std::system("open \"http://localhost:8787/auth/google\"");
#else
        std::system("xdg-open \"http://localhost:8787/auth/google\"");
#endif
    }).detach();
    return false;
}

bool member_credits_reload_roster(obs_properties_t *, obs_property_t *, void *data)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (!credits)
        return false;

    credits->roster_file_loaded = false;
    if (!load_roster_file(credits))
        return false;

    credits->dirty = true;
    reset_animation(credits, true);
    return false;
}

obs_properties_t *member_credits_properties(void *data)
{
    obs_properties_t *properties = obs_properties_create();
    obs_properties_t *playback = obs_properties_create();
    obs_properties_add_button2(
        playback,
        "reset_play",
        obs_module_text("Reset & Play"),
        member_credits_reset_play,
        data
    );
    obs_properties_add_button2(playback, "play", obs_module_text("Play"), member_credits_play, data);
    obs_properties_add_button2(playback, "pause", obs_module_text("Pause"), member_credits_pause, data);
    obs_properties_add_button2(playback, "stop", obs_module_text("Stop"), member_credits_stop, data);
    obs_properties_add_group(
        properties,
        "playback_actions",
        obs_module_text("Playback"),
        OBS_GROUP_NORMAL,
        playback
    );

    obs_properties_t *data_actions = obs_properties_create();
    obs_properties_add_button2(
        data_actions,
        "reload_roster",
        obs_module_text("Reload roster"),
        member_credits_reload_roster,
        data
    );
    obs_properties_add_button2(
        data_actions,
        "connect_youtube",
        obs_module_text("Connect YouTube"),
        member_credits_connect_youtube,
        data
    );
    obs_properties_add_group(
        properties,
        "source_actions",
        obs_module_text("Roster and YouTube"),
        OBS_GROUP_NORMAL,
        data_actions
    );
    obs_properties_add_text(properties, "kicker", obs_module_text("Kicker"), OBS_TEXT_DEFAULT);
    obs_properties_add_text(properties, "title", obs_module_text("Title"), OBS_TEXT_DEFAULT);
    obs_properties_add_text(properties, "footer", obs_module_text("Footer"), OBS_TEXT_DEFAULT);
    obs_properties_add_text(
        properties,
        "members",
        obs_module_text("Dummy members and tiers"),
        OBS_TEXT_MULTILINE
    );
    obs_properties_add_path(
        properties,
        "roster_file",
        obs_module_text("Roster file (optional)"),
        OBS_PATH_FILE,
        "Roster files (*.txt)",
        nullptr
    );
    obs_properties_add_path(
        properties,
        "font_path",
        obs_module_text("Font file (optional)"),
        OBS_PATH_FILE,
        "Font files (*.ttf *.otf)",
        nullptr
    );
    obs_property_t *layout_mode = obs_properties_add_list(
        properties,
        "layout_mode",
        obs_module_text("Display mode"),
        OBS_COMBO_TYPE_LIST,
        OBS_COMBO_FORMAT_STRING
    );
    obs_property_list_add_string(
        layout_mode,
        obs_module_text("Credit roll"),
        "credit-roll"
    );
    obs_property_list_add_string(
        layout_mode,
        obs_module_text("Bottom ticker"),
        "bottom-ticker"
    );
    obs_property_t *text_align = obs_properties_add_list(
        properties,
        "text_align",
        obs_module_text("Text alignment"),
        OBS_COMBO_TYPE_LIST,
        OBS_COMBO_FORMAT_STRING
    );
    obs_property_list_add_string(text_align, obs_module_text("Left"), "left");
    obs_property_list_add_string(text_align, obs_module_text("Center / Middle"), "center");
    obs_property_list_add_string(text_align, obs_module_text("Right"), "right");
    obs_properties_add_int(properties, "font_size", obs_module_text("Font size"), 12, 160, 1);
    obs_properties_add_int(
        properties,
        "speed",
        obs_module_text("Animation duration (seconds)"),
        5,
        300,
        1
    );
    obs_properties_add_color(properties, "accent", obs_module_text("Accent color"));
    obs_properties_add_color(properties, "text_color", obs_module_text("Member text color"));
    obs_properties_add_color(properties, "footer_color", obs_module_text("Footer color"));
    obs_properties_add_bool(
        properties,
        "transparent_background",
        obs_module_text("Transparent background")
    );
    obs_properties_add_color(properties, "background", obs_module_text("Background color"));
    return properties;
}

void member_credits_defaults(obs_data_t *settings)
{
    obs_data_set_default_string(settings, "kicker", "MEMBER ROLL CALL");
    obs_data_set_default_string(settings, "title", "Special Thanks");
    obs_data_set_default_string(settings, "footer", "Thank you for keeping this channel alive.");
    obs_data_set_default_string(
        settings,
        "members",
        "[Founding Supporters]\nAstra Nox\nMio Kisaragi\n\n"
        "[Moonlight Members]\nKuma\nRinSora\nNeonMikan\n\n"
        "[Starlight Members]\nBubu Boba\nFia\nYukiTan"
    );
    obs_data_set_default_string(settings, "roster_file", default_roster_path().c_str());
    obs_data_set_default_string(settings, "font_path", "");
    obs_data_set_default_string(settings, "layout_mode", "credit-roll");
    obs_data_set_default_string(settings, "text_align", "center");
    obs_data_set_default_int(settings, "font_size", kDefaultFontSize);
    obs_data_set_default_int(settings, "speed", kDefaultRollDuration);
    obs_data_set_default_int(settings, "accent", 0xFF91A88B);
    obs_data_set_default_int(settings, "text_color", 0xFF292824);
    obs_data_set_default_int(settings, "footer_color", 0xFF6C6A62);
    obs_data_set_default_int(settings, "background", 0xFFFAF9F5);
    obs_data_set_default_bool(settings, "transparent_background", false);
}

void member_credits_show(void *data)
{
    reset_animation(static_cast<member_credits_data *>(data), true);
}

void member_credits_hide(void *data)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (credits)
        credits->playing = false;
}

void member_credits_activate(void *data)
{
    reset_animation(static_cast<member_credits_data *>(data), true);
}

void member_credits_deactivate(void *data)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (credits)
        credits->playing = false;
}

void member_credits_tick(void *data, float seconds)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (!credits)
        return;

    if (load_roster_file(credits)) {
        credits->dirty = true;
        reset_animation(credits, true);
    }
    if (!credits->playing)
        return;

    credits->elapsed += seconds;
    if (!credits->tick_logged) {
        blog(LOG_INFO, "member-credits: video_tick active");
        credits->tick_logged = true;
    }
    const float duration = static_cast<float>(std::max(credits->speed, 1));
    const float progress = std::clamp(credits->elapsed / duration, 0.0f, 1.0f);
    if (is_ticker(credits)) {
        const float total_distance = static_cast<float>(kCanvasWidth + credits->content_width);
        credits->scroll_x = static_cast<float>(kCanvasWidth) - total_distance * progress;
        if (credits->elapsed >= duration) {
            credits->elapsed = std::fmod(credits->elapsed, duration);
            credits->scroll_x = static_cast<float>(kCanvasWidth);
        }
    } else {
        const float total_distance = static_cast<float>(kCanvasHeight + credits->content_height);
        credits->scroll_y = static_cast<float>(kCanvasHeight) - total_distance * progress;
        if (credits->elapsed >= duration)
            credits->playing = false;
    }
}

void member_credits_render(void *data, gs_effect_t *effect)
{
    auto *credits = static_cast<member_credits_data *>(data);
    if (!credits)
        return;

    if (credits->dirty || !credits->texture) {
        rebuild_pixels(credits);
        upload_texture(credits);
    }
    if (!credits->texture)
        return;

    if (!credits->render_logged) {
        blog(LOG_INFO, "member-credits: video_render active");
        credits->render_logged = true;
    }

    gs_effect_t *draw_effect = effect ? effect : obs_get_base_effect(OBS_EFFECT_DEFAULT);
    if (!draw_effect)
        return;

    if (!credits->transparent_background && !is_ticker(credits)) {
        struct vec4 background;
        background.x = static_cast<float>(channel(credits->background, 16)) / 255.0f;
        background.y = static_cast<float>(channel(credits->background, 8)) / 255.0f;
        background.z = static_cast<float>(channel(credits->background, 0)) / 255.0f;
        background.w = 1.0f;
        gs_clear(GS_CLEAR_COLOR, &background, 0.0f, 0);
    }

    gs_eparam_t *image_param = gs_effect_get_param_by_name(draw_effect, "image");
    if (!image_param)
        return;

    gs_effect_set_texture_srgb(image_param, credits->texture);
    gs_blend_state_push();
    gs_blend_function(GS_BLEND_SRCALPHA, GS_BLEND_INVSRCALPHA);
    gs_matrix_push();
    if (is_ticker(credits)) {
        gs_matrix_translate3f(
            credits->scroll_x,
            static_cast<float>(kCanvasHeight - credits->content_height - 24),
            0.0f
        );
    } else {
        gs_matrix_translate3f(0.0f, credits->scroll_y, 0.0f);
    }
    while (gs_effect_loop(draw_effect, "Draw"))
        gs_draw_sprite(credits->texture, 0, credits->content_width, credits->content_height);
    gs_matrix_pop();
    gs_blend_state_pop();
}

} // namespace

const obs_source_info member_credits_source_info = [] {
    obs_source_info info = {};
    info.id = "member_credits_source";
    info.type = OBS_SOURCE_TYPE_INPUT;
    info.output_flags = OBS_SOURCE_VIDEO | OBS_SOURCE_CUSTOM_DRAW;
    info.get_name = member_credits_get_name;
    info.create = member_credits_create;
    info.destroy = member_credits_destroy;
    info.save = member_credits_save;
    info.get_width = member_credits_get_width;
    info.get_height = member_credits_get_height;
    info.get_defaults = member_credits_defaults;
    info.get_properties = member_credits_properties;
    info.update = member_credits_update;
    info.video_tick = member_credits_tick;
    info.video_render = member_credits_render;
    info.show = member_credits_show;
    info.hide = member_credits_hide;
    info.activate = member_credits_activate;
    info.deactivate = member_credits_deactivate;
    return info;
}();
