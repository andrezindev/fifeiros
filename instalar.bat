@echo off
rem Instala o solver do FIFEIROS: cria o ambiente Python (.venv) e baixa as dependencias.
rem Rode uma vez (ou de novo depois de atualizar o projeto).
chcp 65001 >nul
cd /d "%~dp0"
title Instalar FIFEIROS

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo Python nao encontrado.
  echo Instale o Python 3.11 ou mais novo: https://www.python.org/downloads/
  echo Na instalacao, marque "Add python.exe to PATH". Depois rode este arquivo de novo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Criando o ambiente Python em .venv ...
  %PY% -m venv .venv || goto :erro
)

echo Instalando as dependencias (OR-Tools) ...
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
".venv\Scripts\python.exe" -m pip install -e ".[dev]" || goto :erro

echo.
echo Pronto! Agora de dois cliques em iniciar-solver.bat
pause
exit /b 0

:erro
echo.
echo Algo deu errado na instalacao. Veja a mensagem acima.
pause
exit /b 1
