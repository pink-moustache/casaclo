-- GAVINHO - Piloto BIM->Max - dump da cena (SO LEITURA) v1 - 2026-11-04
-- O que faz: le a cena inteira (objectos, materiais, layers, modifiers, File Link)
--             e grava UM ficheiro novo de inventario (JSON) ao lado do .max aberto.
-- NAO altera nada na cena. NAO apaga nada. NAO grava no .max. So le e cria 1 ficheiro.
--
-- Como correr (qualquer uma das 3, o Max nao precisa de reiniciar):
--   1) Arrastar este ficheiro .ms para dentro da janela 3D do Max e soltar
--   2) F11 (MaxScript Listener) -> colar TUDO de uma vez -> Enter
--   3) Menu Scripting -> Run Script... -> escolher este ficheiro
-- No fim aparece um aviso com o caminho do ficheiro gerado (tambem fica no clipboard).
-- Se der qualquer erro: print do Listener e enviar a Ines.

(
    -- ---------- helpers ----------
    local rx = dotNetClass "System.Text.RegularExpressions.Regex"
    fn esc v = (
        if v == undefined then "" else (
            local s = v as string
            s = rx.Replace s "\\" "\\\\"
            rx.Replace s "\"" "\\\""
        )
    )
    fn jstr v = "\"" + (esc v) + "\""

    -- ---------- caminho de saida ----------
    local outPath = maxFilePath + "gavinho_cena_dump.json"
    if maxFilePath == "" do outPath = (getDir #scene) + "\\gavinho_cena_dump.json"

    local f = createFile outPath
    if f == undefined then (
        messageBox "Nao consegui gravar o ficheiro.\nCorre outra vez e, se repetir, avisa a Ines."
    )
    else (
        -- contadores de uso de material (nome -> n. de objectos)
        local matNames = #()
        local matCounts = #()

        format "{\n" to:f
        format "\"meta\": {\n" to:f
        format "  \"max_versao_raw\": %,\n" (maxVersion())[1] to:f
        format "  \"ficheiro_max\": %,\n" (jstr maxFileName) to:f
        format "  \"caminho_max\": %,\n" (jstr maxFilePath) to:f
        format "  \"renderer\": %,\n" (jstr renderers.production) to:f
        format "  \"objectos_total\": %\n" objects.count to:f
        format "},\n" to:f

        -- ---------- layers ----------
        format "\"layers\": [" to:f
        for i = 1 to LayerManager.count do (
            local L = LayerManager.getLayer i
            if L != undefined do (
                if i > 1 do format ", " to:f
                format "%" (jstr L.name) to:f
            )
        )
        format "],\n" to:f

        -- ---------- objectos ----------
        format "\"objectos\": [\n" to:f
        for i = 1 to objects.count do (
            local o = objects[i]
            local oMat = ""
            local oLay = ""
            local mods = ""
            try ( if o.material != undefined do oMat = o.material.name as string ) catch()
            try ( oLay = o.layer.name as string ) catch()
            try ( for m in o.modifiers do ( if mods != "" do mods += "|"; mods += (m.name as string) ) ) catch()
            format "  {\"nome\": %, \"classe\": %, \"superclasse\": %, \"layer\": %, \"material\": %, \"modifiers\": %}" \
                (jstr o.name) (jstr ((classof o) as string)) (jstr ((superclassof o) as string)) (jstr oLay) (jstr oMat) (jstr mods) to:f
            if i < objects.count do format "," to:f
            format "\n" to:f
            if oMat != "" do (
                local ix = findItem matNames oMat
                if ix == 0 then ( append matNames oMat; append matCounts 1 ) else ( matCounts[ix] += 1 )
            )
        )
        format "],\n" to:f

        -- ---------- materiais distintos ----------
        format "\"materiais\": [\n" to:f
        local ms = for m in sceneMaterials collect m
        for i = 1 to ms.count do (
            local m = ms[i]
            local nm = ""
            local cl = ""
            try ( nm = m.name as string ) catch()
            try ( cl = (classof m) as string ) catch()
            local ix = findItem matNames nm
            local cnt = if ix > 0 then matCounts[ix] else 0
            format "  {\"nome\": %, \"classe\": %, \"objectos\": %}" (jstr nm) (jstr cl) cnt to:f
            if i < ms.count do format "," to:f
            format "\n" to:f
        )
        format "]\n" to:f

        -- ---------- file link (defensivo: se a versao nao expuser, sai null) ----------
        format ",\n\"file_link\": " to:f
        local flOK = false
        try (
            if FileLinkManager != undefined do (
                local nl = FileLinkManager.numLinks
                if nl != undefined and nl > 0 do (
                    format "[\n" to:f
                    for i = 1 to nl do (
                        local nm = ""
                        local fp = ""
                        try ( nm = FileLinkManager.getLinkName i as string ) catch()
                        try ( fp = FileLinkManager.getLinkFile i as string ) catch()
                        format "  {\"nome\": %, \"ficheiro\": %}" (jstr nm) (jstr fp) to:f
                        if i < nl do format "," to:f
                        format "\n" to:f
                    )
                    format "]" to:f
                    flOK = true
                )
            )
        ) catch()
        if not flOK do format "null" to:f
        format "\n}\n" to:f

        close f
        setClipboardText outPath
        messageBox ("Inventario salvo em:\n\n" + outPath + "\n\n(O caminho tambem ficou no clipboard - Ctrl+V)\nEnvia esse arquivo para a Ines.")
    )
)
