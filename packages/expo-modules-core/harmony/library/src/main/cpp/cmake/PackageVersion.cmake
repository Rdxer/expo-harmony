# Hvigor may rewrite a HAR manifest using unquoted keys and single quotes.
function(read_expo_package_version path output)
  file(READ "${path}" manifest)
  string(JSON version ERROR_VARIABLE error GET "${manifest}" version)

  if(error)
    string(REGEX MATCH
      "(^|[,{\n])[ \t\r\n]*[\"']?version[\"']?[ \t\r\n]*:[ \t\r\n]*[\"']([^\"']+)[\"']"
      match "${manifest}")
    set(version "${CMAKE_MATCH_2}")
  endif()

  if(NOT version MATCHES "^[0-9]+\\.[0-9]+\\.[0-9]+([-+][0-9A-Za-z.-]+)?$")
    message(FATAL_ERROR "Invalid package version '${version}' in ${path}")
  endif()

  set("${output}" "${version}" PARENT_SCOPE)
endfunction()
