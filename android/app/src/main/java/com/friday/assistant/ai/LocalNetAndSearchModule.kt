package com.friday.assistant.ai

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class LocalNetAndSearchModule(private val context: Context) {

    fun isNetworkOnline(): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return false
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        } catch (_: Exception) {
            false
        }
    }

    fun searchPublicKnowledge(rawQuery: String): String {
        val result = JSONObject()
        if (!isNetworkOnline()) {
            result.put("summary", "")
            result.put("sources", JSONArray())
            return result.toString()
        }

        val cleanQuery = rawQuery
            .replace(Regex("^(what is|who is|explain|define|tell me about|search google for|search online for|search)\\s+", RegexOption.IGNORE_CASE), "")
            .replace("?", "")
            .trim()

        if (cleanQuery.isEmpty()) {
            result.put("summary", "")
            result.put("sources", JSONArray())
            return result.toString()
        }

        return try {
            val encoded = URLEncoder.encode(cleanQuery, "UTF-8")
            val searchJson = fetchJson("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=$encoded&utf8=&format=json")
            val hits = searchJson?.optJSONObject("query")?.optJSONArray("search")
            if (hits != null && hits.length() > 0) {
                val topTitle = hits.getJSONObject(0).optString("title", cleanQuery)
                val titleSlug = URLEncoder.encode(topTitle.replace(" ", "_"), "UTF-8")
                val sumJson = fetchJson("https://en.wikipedia.org/api/rest_v1/page/summary/$titleSlug")
                val extract = sumJson?.optString("extract", "") ?: ""
                val pageUrl = sumJson?.optJSONObject("content_urls")
                    ?.optJSONObject("desktop")
                    ?.optString("page")
                    ?: "https://en.wikipedia.org/wiki/$titleSlug"

                if (extract.isNotEmpty()) {
                    val sources = JSONArray().apply {
                        put(JSONObject().apply {
                            put("title", topTitle)
                            put("uri", pageUrl)
                        })
                    }
                    result.put("summary", "$topTitle: $extract")
                    result.put("sources", sources)
                    return result.toString()
                }
            }
            result.put("summary", "")
            result.put("sources", JSONArray())
            result.toString()
        } catch (_: Exception) {
            result.put("summary", "")
            result.put("sources", JSONArray())
            result.toString()
        }
    }

    private fun fetchJson(urlString: String): JSONObject? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(urlString).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 4500
                readTimeout = 4500
                setRequestProperty("User-Agent", "FRIDAY-Android-Assistant/1.0")
            }
            if (conn.responseCode !in 200..299) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            JSONObject(body)
        } catch (_: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }
}
