cmake_minimum_required(VERSION 3.10)

project(LibreChat)

set(CMAKE_CXX_STANDARD 17)

# Set the project source files
set(SOURCE_FILES
        run_librechat.cpp
)

# Configure the project for each platform
if(WIN32)
    add_definitions(-D_WIN32)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /EHsc")
elseif(APPLE)
    add_definitions(-D__APPLE__)
elseif(UNIX)
    add_definitions(-D__unix__)
endif()

# Add the executable target
add_executable(LibreChat_${CMAKE_SYSTEM_NAME}_${CMAKE_SYSTEM_PROCESSOR} ${SOURCE_FILES})

# Add a post-build command to copy the executable to the parent directory
add_custom_command(TARGET LibreChat_${CMAKE_SYSTEM_NAME}_${CMAKE_SYSTEM_PROCESSOR} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy $<TARGET_FILE:LibreChat_${CMAKE_SYSTEM_NAME}_${CMAKE_SYSTEM_PROCESSOR}> ..
)
