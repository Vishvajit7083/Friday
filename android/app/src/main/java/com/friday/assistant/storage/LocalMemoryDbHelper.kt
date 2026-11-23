package com.friday.assistant.storage

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class LocalMemoryDbHelper(context: Context) : SQLiteOpenHelper(
    context,
    DATABASE_NAME,
    null,
    DATABASE_VERSION
) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS memory_kv (
                record_key TEXT PRIMARY KEY,
                payload_json TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS memory_kv")
        onCreate(db)
    }

    fun saveRecord(recordKey: String, payloadJson: String): Boolean {
        return try {
            val db = writableDatabase
            val values = ContentValues().apply {
                put("record_key", recordKey)
                put("payload_json", payloadJson)
                put("updated_at", System.currentTimeMillis())
            }
            db.insertWithOnConflict("memory_kv", null, values, SQLiteDatabase.CONFLICT_REPLACE)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun readRecord(recordKey: String): String {
        return try {
            val db = readableDatabase
            db.rawQuery(
                "SELECT payload_json FROM memory_kv WHERE record_key = ? LIMIT 1",
                arrayOf(recordKey)
            ).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) ?: "" else ""
            }
        } catch (_: Exception) {
            ""
        }
    }

    companion object {
        private const val DATABASE_NAME = "friday_local_memory.db"
        private const val DATABASE_VERSION = 1
    }
}
