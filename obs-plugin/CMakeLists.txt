cmake_minimum_required(VERSION 3.20)

project(member-credits VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(MEMBER_CREDITS_PLUGIN_NAME "member-credits")

add_library(
  ${MEMBER_CREDITS_PLUGIN_NAME}
  MODULE
  src/member-credits-source.cpp
  src/plugin-main.cpp
)

target_include_directories(${MEMBER_CREDITS_PLUGIN_NAME} PRIVATE include)

find_package(CURL REQUIRED)
find_package(Freetype REQUIRED)

find_path(
  OBS_INCLUDE_DIR
  NAMES obs-module.h
  HINTS
    ${OBS_SOURCE_DIR}/libobs
    ${OBS_SOURCE_DIR}/libobs/include
    ${OBS_INSTALL_DIR}/include/obs
    /usr/include/obs
    /usr/local/include/obs
)

find_library(
  OBS_LIBRARY
  NAMES obs libobs
  HINTS
    ${OBS_INSTALL_DIR}/lib
    /usr/lib
    /usr/local/lib
)

if(NOT OBS_INCLUDE_DIR OR NOT OBS_LIBRARY)
  message(FATAL_ERROR
    "OBS development files were not found. Set OBS_SOURCE_DIR and OBS_INSTALL_DIR, "
    "or install the OBS development package before configuring this project."
  )
endif()

target_include_directories(
  ${MEMBER_CREDITS_PLUGIN_NAME}
  PRIVATE
    ${OBS_INCLUDE_DIR}
    ${FREETYPE_INCLUDE_DIRS}
)
target_link_libraries(
  ${MEMBER_CREDITS_PLUGIN_NAME}
  PRIVATE
    ${OBS_LIBRARY}
    Freetype::Freetype
    CURL::libcurl
)

set_target_properties(
  ${MEMBER_CREDITS_PLUGIN_NAME}
  PROPERTIES
    PREFIX ""
    OUTPUT_NAME "${MEMBER_CREDITS_PLUGIN_NAME}"
)

set(MEMBER_CREDITS_BINARY_DESTINATION "bin/64bit")

install(
  TARGETS ${MEMBER_CREDITS_PLUGIN_NAME}
  RUNTIME DESTINATION ${MEMBER_CREDITS_BINARY_DESTINATION}
  LIBRARY DESTINATION ${MEMBER_CREDITS_BINARY_DESTINATION}
)

install(
  DIRECTORY data/
  DESTINATION data
)
