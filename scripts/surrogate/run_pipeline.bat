@echo off
chcp 65001 >nul
title RIIC Surrogate Pipeline
cd /d "%~dp0..\.."

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_pipeline.ps1" %*
pause
