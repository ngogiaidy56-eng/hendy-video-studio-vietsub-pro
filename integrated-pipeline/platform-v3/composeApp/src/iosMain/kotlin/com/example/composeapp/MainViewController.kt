package com.example.composeapp

import androidx.compose.ui.window.ComposeUIViewController
import platform.UIKit.UIViewController

fun MainViewController(apiBaseUrl: String = "http://127.0.0.1:8080"): UIViewController =
    ComposeUIViewController { App(apiBaseUrl = apiBaseUrl) }
