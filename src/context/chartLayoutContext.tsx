import React, { createContext, ReactNode, useContext, useEffect } from 'react';
import find from 'lodash/find';
import every from 'lodash/every';
import { createSelector } from '@reduxjs/toolkit';
import {
  CartesianViewBox,
  ChartOffset,
  LayoutType,
  Margin,
  PolarAngleAxisMap,
  PolarRadiusAxisMap,
  Size,
  XAxisMap,
  YAxisMap,
} from '../util/types';
import type { CategoricalChartState, XAxisWithExtraData, YAxisWithExtraData } from '../chart/types';
import { calculateViewBox } from '../util/calculateViewBox';
import { getAnyElementOfObject } from '../util/DataUtils';
import { LegendPayloadProvider } from './legendPayloadContext';
import { TooltipContextProvider, TooltipContextValue } from './tooltipContext';
import { PolarRadiusAxisProps } from '../polar/PolarRadiusAxis';
import { PolarAngleAxisProps } from '../polar/PolarAngleAxis';
import { useAppDispatch, useAppSelector } from '../state/hooks';
import { setPolarAngleAxisMap, setPolarRadiusAxisMap, setXAxisMap, setYAxisMap } from '../state/axisSlice';
import { RechartsRootState } from '../state/store';
import { setChartSize, setLayout, setMargin } from '../state/layoutSlice';
import { selectChartOffset } from '../state/selectors/selectChartOffset';
import { selectChartHeight, selectChartWidth } from '../state/selectors/containerSelectors';

export const ViewBoxContext = createContext<CartesianViewBox | undefined>(undefined);
export const ClipPathIdContext = createContext<string | undefined>(undefined);
export const MarginContext = createContext<Margin>({ top: 5, right: 5, bottom: 5, left: 5 });
// is the updateId necessary? Can we do without? Perhaps hook dependencies are better than explicit updateId.
const UpdateIdContext = createContext<number>(0);

export type ChartLayoutContextProviderProps = {
  state: CategoricalChartState;
  children: ReactNode;
  clipPathId: string;
  width: number;
  height: number;
  margin: Margin;
  layout: LayoutType;
};

/**
 * Will add all the properties required to render all individual Recharts components into a React Context.
 *
 * If you want to read these properties, see the collection of hooks exported from this file.
 *
 * @param {object} props CategoricalChartState, plus children
 * @returns React Context Provider
 */
export const ChartLayoutContextProvider = (props: ChartLayoutContextProviderProps) => {
  const {
    state: {
      xAxisMap,
      yAxisMap,
      angleAxisMap,
      radiusAxisMap,
      offset,
      activeLabel,
      activePayload,
      isTooltipActive,
      activeCoordinate,
      updateId,
      activeTooltipIndex,
    },
    clipPathId,
    children,
    width,
    height,
    margin,
    layout,
  } = props;

  /**
   * Perhaps we should compute this property when reading? Let's see what is more often used
   */
  const viewBox = calculateViewBox(offset);

  const tooltipContextValue: TooltipContextValue = {
    label: activeLabel,
    payload: activePayload,
    coordinate: activeCoordinate,
    active: isTooltipActive,
    index: activeTooltipIndex,
  };

  const dispatch = useAppDispatch();

  dispatch(setXAxisMap(xAxisMap));
  dispatch(setYAxisMap(yAxisMap));
  dispatch(setPolarAngleAxisMap(angleAxisMap));
  dispatch(setPolarRadiusAxisMap(radiusAxisMap));
  dispatch(setLayout(layout));
  dispatch(setChartSize({ width, height }));
  dispatch(setMargin(margin));

  /*
   * This pretends to be a single context but actually is split into multiple smaller ones.
   * Why?
   * Because one React Context only allows to set one value.
   * But we need to set multiple values.
   * If we do that with one context, then we force re-render on components that might not even be interested
   * in the part of the state that has changed.
   *
   * By splitting into smaller contexts, we allow each component to be optimized and only re-render when its dependencies change.
   *
   * To actually achieve the optimal re-render, it is necessary to use React.memo().
   * See the test file for details.
   */
  return (
    <UpdateIdContext.Provider value={updateId}>
      <MarginContext.Provider value={margin}>
        <LegendPayloadProvider>
          <ViewBoxContext.Provider value={viewBox}>
            <ClipPathIdContext.Provider value={clipPathId}>
              <TooltipContextProvider value={tooltipContextValue}>{children}</TooltipContextProvider>
            </ClipPathIdContext.Provider>
          </ViewBoxContext.Provider>
        </LegendPayloadProvider>
      </MarginContext.Provider>
    </UpdateIdContext.Provider>
  );
};

export const useClipPathId = (): string | undefined => {
  return useContext(ClipPathIdContext);
};

export const selectXAxisMap = (state: RechartsRootState): XAxisMap | undefined => state.axis.xAxisMap;
export const selectYAxisMap = (state: RechartsRootState): YAxisMap | undefined => state.axis.yAxisMap;
export const selectPolarAngleAxisMap = (state: RechartsRootState): PolarAngleAxisMap | undefined =>
  state.axis.polarAngleAxisMap;
export const selectPolarRadiusAxisMap = (state: RechartsRootState): PolarRadiusAxisMap | undefined =>
  state.axis.polarRadiusAxisMap;
export const selectArbitraryXAxis: (state: RechartsRootState) => XAxisWithExtraData | undefined = createSelector(
  selectXAxisMap,
  getAnyElementOfObject,
);

/**
 * This will find an arbitrary first XAxis. If there's exactly one it always returns that one
 * - but if there are multiple then it can return any of those.
 *
 * If you want specific XAxis out of multiple then prefer using useXAxisOrThrow
 *
 * @returns X axisOptions, or undefined - if there are no X axes
 */
export const useArbitraryXAxis = (): XAxisWithExtraData | undefined => useAppSelector(selectArbitraryXAxis);

export const selectArbitraryYAxis: (state: RechartsRootState) => YAxisWithExtraData | undefined = createSelector(
  selectYAxisMap,
  getAnyElementOfObject,
);

/**
 * This hooks will:
 * 1st attempt to find an YAxis that has all elements in its domain finite
 * If no such axis exists, it will return an arbitrary YAxis
 * if there are no Y axes then it returns undefined
 *
 * @returns Either Y axisOptions, or undefined if there are no Y axes
 */
export const useYAxisWithFiniteDomainOrRandom = (): YAxisWithExtraData | undefined => {
  const yAxisMap = useAppSelector(selectYAxisMap);
  const yAxisWithFiniteDomain = find(yAxisMap, axis => every(axis.domain, Number.isFinite));
  return yAxisWithFiniteDomain || getAnyElementOfObject(yAxisMap);
};

/**
 * This either finds and returns Axis by the specified ID, or returns undefined if an axis with this ID does not exist.
 *
 * @param axisId identifier of the axis - it's either autogenerated ('0'), or passed via `id` prop as <PolarAngleAxis id='foo' />
 * @returns axis configuration object, or undefined
 */
export const useMaybePolarAngleAxis = (axisId: string | number): PolarAngleAxisProps | undefined => {
  const polarAngleAxisMap = useAppSelector(selectPolarAngleAxisMap);
  return polarAngleAxisMap?.[axisId];
};

export const selectArbitraryPolarAngleAxis: (state: RechartsRootState) => PolarAngleAxisProps | undefined =
  createSelector(selectPolarAngleAxisMap, getAnyElementOfObject);

/**
 * This will find an arbitrary first PolarAngleAxis. If there's exactly one it always returns that one
 * - but if there are multiple then it can return any of those.
 *
 * @returns polarAngle axisOptions, or undefined - if there are no PolarAngleAxes
 */
export const useArbitraryPolarAngleAxis = (): PolarAngleAxisProps | undefined =>
  useAppSelector(selectArbitraryPolarAngleAxis);

/**
 * This either finds and returns Axis by the specified ID, or returns undefined if an axis with this ID does not exist.
 *
 * @param axisId identifier of the axis - it's either autogenerated ('0'), or passed via `id` prop as <PolarRadiusAxis id='foo' />
 * @returns axis configuration object, or undefined
 */
export const useMaybePolarRadiusAxis = (axisId: string | number): PolarRadiusAxisProps | undefined => {
  const polarRadiusAxisMap = useAppSelector(selectPolarRadiusAxisMap);
  return polarRadiusAxisMap?.[axisId];
};

export const selectArbitraryPolarRadiusAxis: (state: RechartsRootState) => PolarRadiusAxisProps | undefined =
  createSelector(selectPolarRadiusAxisMap, getAnyElementOfObject);

/**
 * This will find an arbitrary first PolarRadiusAxis . If there's exactly one it always returns that one
 * - but if there are multiple then it can return any of those.
 *
 * @returns polarAngle axisOptions, or undefined - if there are no PolarRadiusAxes
 */
export const useArbitraryPolarRadiusAxis = (): PolarRadiusAxisProps | undefined =>
  useAppSelector(selectArbitraryPolarRadiusAxis);

export const useViewBox = (): CartesianViewBox => {
  return useContext(ViewBoxContext);
};

const manyComponentsThrowErrorsIfOffsetIsUndefined: ChartOffset = {};
export const useOffset = (): ChartOffset => {
  return useAppSelector(selectChartOffset) ?? manyComponentsThrowErrorsIfOffsetIsUndefined;
};

export const useChartWidth = (): number => {
  return useAppSelector(selectChartWidth);
};

export const useChartHeight = (): number => {
  return useAppSelector(selectChartHeight);
};

export const useMargin = (): Margin => {
  return useContext(MarginContext);
};

export const useUpdateId = () => `brush-${useContext(UpdateIdContext)}`;

export const selectChartLayout = (state: RechartsRootState): LayoutType => state.layout.layoutType;

export const useChartLayout = () => useAppSelector(selectChartLayout);

export const ReportChartSize = (props: Size): null => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(setChartSize(props));
  }, [dispatch, props]);

  return null;
};
