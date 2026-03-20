// ... (previous imports remain the same)

const ComplianceReview = () => {
  // ... (previous state declarations remain the same)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/modules")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Film className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold font-[Space_Grotesk]">Infinio</span>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Script Input */}
          <div className="lg:col-span-2 space-y-6">
            {/* Script Input Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  剧本内容
                </CardTitle>
                <div className="flex gap-2 items-center">
                  {/* Model Selector */}
                  <div className="relative" ref={modelDropdownRef}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                      className="gap-1.5 min-w-[140px] justify-between"
                    >
                      <span className="truncate">{MODEL_OPTIONS.find(o => o.value === model)?.label}</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    </Button>
                    {modelDropdownOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]">
                        {MODEL_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleModelChange(opt.value)}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors ${opt.value === model ? "bg-primary/10 text-primary font-semibold" : "text-popover-foreground hover:text-foreground"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.pdf,.docx,.doc,.xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {isUploading ? "解析中..." : "上传文档"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* 输入模式切换 */}
                {tableData && (
                  <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "text" | "table")} className="mb-4">
                    <TabsList>
                      <TabsTrigger value="table"><TableIcon className="h-3.5 w-3.5 mr-1" />表格模式</TabsTrigger>
                      <TabsTrigger value="text"><FileText className="h-3.5 w-3.5 mr-1" />文本模式</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}

                {/* 表格显示模式 */}
                {inputMode === "table" && tableData ? (
                  <div className="max-h-[400px] overflow-auto rounded-md border border-border">
                    <div className="text-xs text-muted-foreground px-3 py-1.5 bg-muted/50 border-b border-border flex items-center gap-2">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {tableData.fileName}
                      {tableData.sheetName && <span>· {tableData.sheetName}</span>}
                      <span>({tableData.rows.length} 行)</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {tableData.headers.map((header, i) => (
                            <TableHead key={i} className="text-xs whitespace-nowrap">{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableData.rows.map((row, rowIndex) => (
                          <TableRow key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <TableCell key={cellIndex} className="text-xs py-1.5">{String(cell ?? "")}</TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  /* 文本显示模式 */
                  <>
                    <Textarea
                      value={scriptText}
                      onChange={(e) => setScriptText(e.target.value)}
                      placeholder="粘贴剧本内容，或点击上方按钮上传 TXT / PDF / DOCX / XLSX 文档..."
                      rows={12}
                      className="font-mono text-sm"
                    />
                    <div className="text-xs text-muted-foreground mt-2 text-right">
                      {scriptText.length} 字
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Compliance Report Card — Collapsible */}
            <Collapsible open={reportOpen} onOpenChange={setReportOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="flex flex-row items-center justify-between cursor-pointer select-none hover:bg-accent/30 transition-colors rounded-t-lg">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5" />
                      合规审核报告
                      {complianceReport && !isGenerating && (
                        <span className="text-sm font-normal text-muted-foreground">
                          ⛔{redLineCount} · ⚠️{highRiskCount} · ℹ️{infoCount}
                        </span>
                      )}
                      {reportOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </CardTitle>
                    <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                      {/* 对话审查开关 */}
                      <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
                        <span className="text-xs font-medium text-muted-foreground">对话审查</span>
                        <Switch
                          checked={enableDialogueReview}
                          onCheckedChange={setEnableDialogueReview}
                          className="mx-1"
                        />
                      </div>

                      {/* 审核模式切换 */}
                      <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
                        <button
                          onClick={() => setReviewMode("text")}
                          className={`px-2 py-1 text-xs rounded transition-colors ${reviewMode === "text" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          文字审核
                        </button>
                        <button
                          onClick={() => setReviewMode("script")}
                          className={`px-2 py-1 text-xs rounded transition-colors ${reviewMode === "script" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                        >
                          情节审核
                        </button>
                      </div>

                      {/* 严格程度切换 */}
                      <div className="flex items-center bg-muted rounded-md p-0.5 gap-0.5">
                        {(Object.keys(STRICTNESS_CONFIG) as StrictnessLevel[]).map((level) => (
                          <button
                            key={level}
                            onClick={() => setStrictness(level)}
                            className={`px-2 py-1 text-xs rounded transition-colors ${strictness === level ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"}`}
                            title={STRICTNESS_CONFIG[level].desc}
                          >
                            {STRICTNESS_CONFIG[level].label}
                          </button>
                        ))}
                      </div>

                      {complianceReport && !isGenerating && (
                        <>
                          <TranslateToggle
                            isNonChinese={nonChinese}
                            isTranslating={isTranslating}
                            showTranslation={showTranslation}
                            onTranslate={() => translate(complianceReport)}
                            onClear={clearTranslation}
                            onStop={stopTranslation}
                            disabled={editing}
                          />
                          <Button variant="outline" size="sm" onClick={() => setEditing(!editing)} className="gap-1.5">
                            {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                            {editing ? "预览" : "编辑"}
                          </Button>
                        </>
                      )}
                      {isGenerating ? (
                        <Button variant="destructive" size="sm" onClick={handleStop} className="gap-1.5">
                          <Square className="h-3.5 w-3.5" />
                          停止
                        </Button>
                      ) : (
                        <Button
                          variant={complianceReport ? "outline" : "default"}
                          size="sm"
                          onClick={handleGenerate}
                          disabled={!scriptText.trim()}
                          className="gap-1.5"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {complianceReport ? (reviewMode === "script" ? "重新情节审核" : "重新文字审核") : (reviewMode === "script" ? "情节审核" : "文字审核")}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent>
                    {segmentProgress && (
                      <div className="mb-4 space-y-1">
                        <div className="text-xs text-muted-foreground">
                          正在审核第 {segmentProgress.current}/{segmentProgress.total} 段
                        </div>
                        <Progress value={(segmentProgress.current / segmentProgress.total) * 100} className="h-1.5" />
                      </div>
                    )}
                    {(isTranslating || transCanResume) && <TranslationProgress progress={transProgress} canResume={transCanResume} onResume={resumeTranslation} />}
                    {!displayText ? (
                      <div className="text-center py-16 text-muted-foreground">
                        <p>输入或上传剧本内容后，点击审核按钮进行合规检查</p>
                        <p className="text-xs mt-2">
                          {reviewMode === "script"
                            ? "情节审核：文字违规+画面违规双重审查"
                            : "文字审核：检测字面上的激烈冲突、版权问题、敏感亲密内容"}
                        </p>
                        <p className="text-xs mt-1 text-primary">
                          当前严格程度：{STRICTNESS_CONFIG[strictness].label} - {STRICTNESS_CONFIG[strictness].desc}
                        </p>
                      </div>
                    ) : editing && !isGenerating ? (
                      <Textarea
                        value={complianceReport}
                        onChange={(e) => setComplianceReport(e.target.value)}
                        rows={20}
                        className="font-mono text-sm"
                      />
                    ) : showTranslation && !isGenerating && hasTranslation(complianceReport) ? (
                      <div className="max-h-[600px] overflow-auto">
                        <InterleavedText text={complianceReport} translatedLines={getTranslation(complianceReport)!} />
                      </div>
                    ) : (
                      <pre ref={scrollRef} className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90 max-h-[600px] overflow-auto">
                        {displayText}
                        {isGenerating && <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-text-bottom" />}
                      </pre>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          {/* Right: Only show dialogue stats if dialogue review is NOT enabled */}
          {!enableDialogueReview && (
            <div className="space-y-6">
              {/* 台词字数统计面板 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    台词字数统计
                    {totalStats.totalDialogues > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {episodeStats.length} 集
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 总统计 */}
                  {totalStats.totalDialogues > 0 && (
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/50">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">{totalStats.totalDialogues}</div>
                        <div className="text-xs text-muted-foreground">总台词数</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-primary">{totalStats.totalWords}</div>
                        <div className="text-xs text-muted-foreground">总字数</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-muted-foreground">{totalStats.avgWordsPerDialogue}</div>
                        <div className="text-xs text-muted-foreground">平均字数/句</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${totalStats.overLimitDialogues > 0 ? "text-destructive" : "text-emerald-500"}`}>
                          {totalStats.overLimitDialogues}
                        </div>
                        <div className="text-xs text-muted-foreground">超限台词</div>
                      </div>
                    </div>
                  )}

                  {/* 各集详情 */}
                  {episodeStats.length > 0 ? (
                    <div className="space-y-3 max-h-[400px] overflow-auto">
                      {episodeStats.map((ep) => (
                        <div key={ep.episodeNum} className="p-3 rounded-lg border border-border/50 hover:bg-accent/20 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">第 {ep.episodeNum} 集</span>
                              {ep.overLimitCount > 0 && (
                                <Badge variant="destructive" className="text-[10px] h-5">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {ep.overLimitCount} 句超限
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">{ep.totalWords} 字</span>
                          </div>
                          
                          {/* 进度条 */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">台词分布</span>
                              <span className={ep.totalWords > (isChinese ? 330 : 180) ? "text-destructive font-medium" : "text-muted-foreground"}>
                                {ep.totalWords}/{(isChinese ? 330 : 180)}
                              </span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  ep.totalWords > (isChinese ? 330 : 180) ? "bg-destructive" : "bg-primary"
                                }`}
                                style={{ width: `${Math.min(100, (ep.totalWords / (isChinese ? 330 : 180)) * 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* 场景详情 */}
                          {ep.scenes.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {ep.scenes.slice(0, 3).map((scene) => (
                                <div key={scene.sceneNum} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{scene.sceneNum}</span>
                                  <div className="flex items-center gap-2">
                                    <span>{scene.words} 字</span>
                                    {scene.overLimit && (
                                      <AlertTriangle className="h-3 w-3 text-destructive" />
                                    )}
                                  </div>
                                </div>
                              ))}
                              {ep.scenes.length > 3 && (
                                <div className="text-xs text-muted-foreground text-center">
                                  +{ep.scenes.length - 3} 个场景
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">暂无台词数据</p>
                      <p className="text-xs mt-1">输入剧本后将自动统计各集台词字数</p>
                    </div>
                  )}

                  {/* 提示信息 */}
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <p><strong>字数限制参考：</strong></p>
                        <p>• 单句台词：{isChinese ? "≤35 字" : "≤20 words"}</p>
                        <p>• 单集总计：{isChinese ? "280-330 字" : "150-180 words"}</p>
                        <p>• 4-5 个镜头组：{isChinese ? "≤35 字" : "≤20 words"}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Risk Highlight Comparison - Only show if there are risks or dialogue review is enabled */}
        {(complianceReport && !isGenerating && scriptText && (riskPhrases.length > 0 || (enableDialogueReview && dialogueOverLimitLines.size > 0))) && (
          <Card id="palette-section">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="h-5 w-5" />
                调色盘文本对比
                <span className="text-sm font-normal text-muted-foreground">
                  共识别 {riskPhrases.length} 处风险片段，{riskPhrases.filter(p => (paletteText || scriptText).includes(p)).length} 处已标记
                </span>
              </CardTitle>
              <div className="flex gap-2">
                {/* 表格模式下的撤销/重做 */}
                {inputMode === "table" && tableData && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleTableUndo} disabled={historyIndex < 0} className="gap-1" title="撤销">
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleTableRedo} disabled={historyIndex >= tableHistory.length - 1} className="gap-1" title="重做">
                      <Redo2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {isAutoAdjusting ? (
                  <Button variant="destructive" size="sm" onClick={() => autoAdjustAbortRef.current?.abort()} className="gap-1.5">
                    <Square className="h-3.5 w-3.5" />
                    停止
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleAutoAdjust} className="gap-1.5" disabled={paletteEditing || isAutoAdjusting}>
                    <Wand2 className="h-3.5 w-3.5" />
                    自动调整
                  </Button>
                )}
                {inputMode !== "table" && (
                  <Button variant="outline" size="sm" onClick={handlePaletteEditToggle} className="gap-1.5" disabled={isAutoAdjusting}>
                    {paletteEditing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    {paletteEditing ? "完成" : "编辑"}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handlePaletteExport} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  导出
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 mb-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded bg-red-200 dark:bg-red-800/60 border border-red-500" />
                  ⛔ 红线问题
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded bg-orange-200 dark:bg-orange-700/60 border border-orange-500" />
                  ⚠️ 高风险内容
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="inline-block w-3 h-3 rounded bg-blue-200 dark:bg-blue-700/60 border border-blue-500" />
                  ℹ️ 优化建议
                </span>
                {enableDialogueReview && dialogueOverLimitLines.size > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block w-3 h-3 rounded bg-muted-foreground/15 border border-muted-foreground/30" />
                    💬 台词超限 ({dialogueOverLimitLines.size} 处)
                  </span>
                )}
              </div>
              {/* 表格模式使用高亮表格，文本模式使用高亮文本 */}
              {inputMode === "table" && tableData ? (
                renderHighlightedTable()
              ) : paletteEditing ? (
                <div ref={paletteScrollRef} className="max-h-[600px] overflow-auto rounded-md border border-border bg-muted/30">
                  <Textarea
                    value={paletteText || scriptText}
                    onChange={(e) => setPaletteText(e.target.value)}
                    rows={20}
                    className="font-mono text-sm border-0 focus-visible:ring-0 bg-transparent min-h-[300px]"
                  />
                </div>
              ) : highlightedScript ? (
                <div ref={paletteScrollRef} className="max-h-[600px] overflow-auto rounded-md border border-border p-4 bg-muted/30">
                  <pre
                    ref={paletteEditRef}
                    className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-foreground/90"
                  >
                    {highlightedScript}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <p>AI 报告中标记的风险片段未能在原文中精确匹配。</p>
                  <p className="mt-1">请尝试重新生成报告，AI 将更精确地引用原文。</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ComplianceReview;