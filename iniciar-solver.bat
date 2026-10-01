@echo off
rem Inicia o solver local usado pela extensao FIFEIROS. Feche a janela para parar.
chcp 65001 >nul
cd /d "%~dp0"
title Solver FIFEIROS
if not exist ".venv\Scripts\python.exe" (
  echo Ambiente Python nao encontrado em .venv
  echo Veja a secao "Instalacao no Windows" do README.md
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -m sbc_solver.server
pause
