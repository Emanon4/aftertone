"use client";

import {useEffect,useState} from "react";
import {Moon,Sun} from "lucide-react";

type Theme="dark"|"light";
const themeStorageKey="aftertone-theme";

export function ThemeToggle(){
  const [theme,setTheme]=useState<Theme>(()=>{
    try{return localStorage.getItem(themeStorageKey)==="light"?"light":"dark";}
    catch{return "dark";}
  });
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    document.documentElement.classList.toggle("dark",theme==="dark");
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content",theme==="dark"?"#171513":"#f7f3ee");
    try{localStorage.setItem(themeStorageKey,theme);}catch{/* The current page still switches when storage is unavailable. */}
  },[theme]);
  return <button className="about-link theme-toggle" type="button" onClick={()=>setTheme(current=>current==="dark"?"light":"dark")} aria-label={theme==="dark"?"切换为浅色背景":"切换为深色背景"} title={theme==="dark"?"当前为深色背景":"当前为浅色背景"}>
    {theme==="dark"?<>浅色背景<Sun size={14}/></>:<>深色背景<Moon size={14}/></>}
  </button>;
}
