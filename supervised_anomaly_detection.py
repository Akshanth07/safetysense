import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import os
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_curve, auc, make_scorer
)
from scipy.fftpack import fft
from scipy.stats import kurtosis

# ==============================================================================
# PART 6: EXPLANATION
# ==============================================================================
# 1. Why Supervised Learning Improved Anomaly Detection:
#    Unlike unsupervised methods (Isolation Forest) that guess anomalies based solely on 
#    statistical rarity, supervised models (Random Forest) learn the exact multivariate 
#    signatures of confirmed past failures. They map explicit boundaries between "normal" 
#    and "failure" states, vastly reducing false positives from normal (but statistically rare) 
#    operational noise.
#
# 2. Why Class Imbalance Affects Accuracy:
#    In industrial datasets, 99% of data is normal. A naive model that always predicts "Normal"
#    achieves 99% accuracy but catches 0 failures! The model becomes strongly biased towards
#    the majority class. Using `class_weight="balanced"` forces the algorithm to heavily penalize 
#    mistakes made on the rare anomaly class, ensuring it actively learns their patterns.
#
# 3. Why F1 Score is More Important Than Accuracy:
#    F1 Score is the harmonic mean of Precision and Recall. In fault detection, we care about
#    catching actual failures (Recall) without triggering too many false alarms (Precision). 
#    Since Accuracy is distorted by the massive majority of normal data, F1 gives us a true 
#    measure of how well the model handles the critical, rare anomaly class.
#
# 4. Deployment in Real-Time IoT Streaming:
#    - Edge devices or MQTT brokers ingest sensor streams.
#    - A stream processor (e.g., Kafka Streams, Apache Flink) buffers the last N points 
#      and continuously computes the rolling, FFT, and rate-of-change features in real-time.
#    - The compiled features are passed to a containerized microservice running the trained 
#      Random Forest model's `.predict()` method.
#    - If it outputs `-1`, it triggers control logic (e.g., relay shutdown) or visual alerts.
# ==============================================================================

class SupervisedAnomalyDetector:
    def __init__(self, window=10):
        self.window = window
        self.rf_best_model = None
        self.scaler = StandardScaler()
        self.iso_f1 = 0
        self.rf_f1 = 0
        
    def _fft_peak_freq(self, x):
        """Helper to find the dominant frequency component using FFT"""
        if len(x) < 2: return 0.0
        # Subtract mean to remove zero-frequency DC component
        fft_vals = np.abs(fft(x - np.mean(x)))
        freqs = np.fft.fftfreq(len(x))
        # Match only positive frequencies
        pos_mask = freqs > 0
        if not np.any(pos_mask): return 0.0
        peak_idx = np.argmax(fft_vals[pos_mask])
        return freqs[pos_mask][peak_idx]

    def _spectral_energy(self, x):
        """Helper to calculate spectral energy from FFT"""
        if len(x) == 0: return 0.0
        fft_vals = np.abs(fft(x))
        return np.sum(fft_vals ** 2) / len(x)
        
    def feature_engineering(self, df):
        """PART 1: DATA PREPROCESSING & FEATURE ENGINEERING"""
        print("Starting Feature Engineering...")
        
        calc_rms = lambda x: np.sqrt(np.mean(x**2))
        
        # --- VIBRATION FEATURES ---
        df['vib_rolling_mean'] = df['vibration'].rolling(window=self.window).mean()
        df['vib_rolling_std'] = df['vibration'].rolling(window=self.window).std()
        df['vib_rms'] = df['vibration'].rolling(window=self.window).apply(calc_rms, raw=True)
        df['vib_kurtosis'] = df['vibration'].rolling(window=self.window).apply(kurtosis, raw=True)
        df['vib_fft_peak'] = df['vibration'].rolling(window=self.window).apply(self._fft_peak_freq, raw=True)

        # --- SOUND FEATURES ---
        df['snd_rolling_mean'] = df['sound'].rolling(window=self.window).mean()
        df['snd_rolling_std'] = df['sound'].rolling(window=self.window).std()
        df['snd_rms'] = df['sound'].rolling(window=self.window).apply(calc_rms, raw=True)
        df['snd_spectral_energy'] = df['sound'].rolling(window=self.window).apply(self._spectral_energy, raw=True)

        # --- TEMPERATURE FEATURES ---
        df['temp_rolling_mean'] = df['temperature'].rolling(window=self.window).mean()
        df['temp_roc'] = df['temperature'].diff()

        # --- HUMIDITY FEATURES ---
        df['hum_rolling_mean'] = df['humidity'].rolling(window=self.window).mean()
        df['hum_roc'] = df['humidity'].diff()

        print("Dropping NaN values from rolling operations...")
        df = df.dropna().reset_index(drop=True)
        return df

    def train_and_evaluate(self, df):
        """PART 2, PART 3, PART 4, PART 5"""
        
        # 1. Remove timestamp from training features
        # The target variable is 'label'
        features = [col for col in df.columns if col not in ['timestamp', 'label']]
        X = df[features]
        y = df['label']
        
        # PART 2: Handle Class Imbalance / Show Distribution
        print("\n--- PART 2: CLASS DISTRIBUTION (Before Training) ---")
        value_counts = y.value_counts()
        print(f"Normal (1):   {value_counts.get(1, 0)} samples")
        print(f"Anomaly (-1): {value_counts.get(-1, 0)} samples")
        ratio = value_counts.get(-1,0)/len(y)*100
        print(f"Percentage Anomalies: {ratio:.2f}%")
        
        # Split Dataset (80/20 stratified)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, stratify=y, random_state=42
        )
        
        # Normalize features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_test_scaled = self.scaler.transform(X_test)
        
        # --- PART 5: COMPARISON (ISOLATION FOREST BASELINE) ---
        print("\n--- PART 5: TRAINING BASELINE (Isolation Forest) ---")
        iso_model = IsolationForest(contamination=0.05, random_state=42)
        # Train and Predict. For comparison, predict directly on test set shapes
        iso_model.fit(X_train_scaled)
        iso_preds = iso_model.predict(X_test_scaled)
        
        # Using pos_label=-1 for anomaly class metrics
        self.iso_f1 = f1_score(y_test, iso_preds, pos_label=-1, zero_division=0)
        print(f"Isolation Forest Baseline F1-Score (Anomaly Class): {self.iso_f1:.4f}")
        
        # --- PART 3: MODEL TRAINING (RANDOM FOREST) ---
        print("\n--- PART 3: TRAINING SUPERVISED MODEL (Random Forest) ---")
        rf = RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=42)
        
        param_grid = {
            'max_depth': [None, 10, 20],
            'min_samples_split': [2, 5]
        }
        
        # Create a custom scorer for F1 focusing strictly on the anomaly class (-1)
        scorer = make_scorer(f1_score, pos_label=-1, zero_division=0)
        
        grid_search = GridSearchCV(
            estimator=rf,
            param_grid=param_grid,
            scoring=scorer,
            cv=3,
            n_jobs=-1,
            verbose=1
        )
        
        print("Running GridSearchCV for RandomForest...")
        grid_search.fit(X_train_scaled, y_train)
        
        self.rf_best_model = grid_search.best_estimator_
        print(f"Best Parameters Found: {grid_search.best_params_}")
        
        # Predict on holdout test set generated securely via stratify=y
        rf_preds = self.rf_best_model.predict(X_test_scaled)
        
        # --- PART 4: EVALUATION ---
        acc = accuracy_score(y_test, rf_preds)
        prec = precision_score(y_test, rf_preds, pos_label=-1, zero_division=0)
        rec = recall_score(y_test, rf_preds, pos_label=-1, zero_division=0)
        self.rf_f1 = f1_score(y_test, rf_preds, pos_label=-1, zero_division=0)
        
        print("\n==============================================")
        print("PART 4: SUPERVISED EVALUATION (Test Set)")
        print("==============================================")
        print(f"Accuracy:  {acc:.4f}")
        print(f"Precision: {prec:.4f}  (for Anomaly class -1)")
        print(f"Recall:    {rec:.4f}  (for Anomaly class -1)")
        print(f"F1 Score:  {self.rf_f1:.4f}  (for Anomaly class -1)")
        
        print("\n--- Confusion Matrix ---")
        print(confusion_matrix(y_test, rf_preds, labels=[-1, 1]))
        
        print("\n--- Classification Report ---")
        print(classification_report(y_test, rf_preds, labels=[-1, 1], target_names=['Anomaly (-1)', 'Normal (1)']))
        
        print("\n--- OPTIONAL: MODEL COMPARISON ---")
        print(f"Isolation Forest Baseline F1: {self.iso_f1:.4f}")
        print(f"Random Forest Supervised F1:  {self.rf_f1:.4f}")
        if self.iso_f1 > 0:
            improve = ((self.rf_f1 - self.iso_f1)/self.iso_f1)*100
            print(f"Enhancement: +{improve:.2f}% improvement over Baseline")
        
        # Prep DataFrame for plotting correctly against the original raw features
        # Inverse transform is unnecessary since we can just use original X_test row references
        test_df = X_test.copy()
        test_df['true_label'] = y_test
        test_df['predicted_label'] = rf_preds
        
        # Sort by the original index chronologically for plotting Time Series
        test_df = test_df.sort_index()
        
        return test_df, features

    def plot_results(self, test_df, feature_names):
        """Displays 4 separate matplotlib plots"""
        print("\nGenerating separate plots. Close each one to proceed.")
        
        # ----------------------------------------------------
        # 1. Feature Importance (bar plot)
        # ----------------------------------------------------
        importances = self.rf_best_model.feature_importances_
        indices = np.argsort(importances)[::-1]
        
        plt.figure(figsize=(12, 6))
        plt.title("1. Feature Importances (Random Forest)")
        plt.bar(range(len(feature_names)), importances[indices], align="center", color="teal")
        plt.xticks(range(len(feature_names)), np.array(feature_names)[indices], rotation=45, ha='right')
        plt.tight_layout()
        plt.show(block=False)
        
        # ----------------------------------------------------
        # 2. ROC Curve for the Anomaly Class
        # ----------------------------------------------------
        plt.figure(figsize=(8, 6))
        # Get probability estimates for the Anomaly Class (-1)
        anomaly_class_idx = np.where(self.rf_best_model.classes_ == -1)[0][0]
        
        # We need the transformed inputs here
        X_test = test_df[feature_names]
        X_test_scaled = self.scaler.transform(X_test)
        
        # Predict Probabilities
        y_probs = self.rf_best_model.predict_proba(X_test_scaled)[:, anomaly_class_idx]
        
        # Calculate ROC using the true labels where 1 = Anomaly and 0 = Normal
        y_true_binary = np.where(test_df['true_label'] == -1, 1, 0)
        fpr, tpr, _ = roc_curve(y_true_binary, y_probs)
        roc_auc = auc(fpr, tpr)
        
        plt.plot(fpr, tpr, color='darkorange', lw=2, label=f'ROC curve (area = {roc_auc:.2f})')
        plt.plot([0, 1], [0, 1], color='navy', lw=2, linestyle='--') # Baseline random chance
        plt.xlim([0.0, 1.0])
        plt.ylim([0.0, 1.05])
        plt.xlabel('False Positive Rate')
        plt.ylabel('True Positive Rate')
        plt.title('2. ROC Curve (Anomaly Detection)')
        plt.legend(loc="lower right")
        plt.grid()
        plt.show(block=False)

        # Separate the predicted anomalies for highlight arrays
        anomalies_df = test_df[test_df['predicted_label'] == -1]

        # ----------------------------------------------------
        # 3. Vibration vs Anomalies (Predicted on Test Set)
        # ----------------------------------------------------
        plt.figure(figsize=(10, 5))
        plt.plot(test_df.index, test_df['vibration'], label='Test Set Vibration', color='royalblue')
        plt.scatter(anomalies_df.index, anomalies_df['vibration'], color='red', label='Predicted Anomaly', zorder=5)
        plt.title('3. Vibration vs Predicted Anomalies (Test Set)')
        plt.xlabel('Time (Original Index)')
        plt.ylabel('Vibration Amplitude')
        plt.legend()
        plt.grid(True)
        plt.show(block=False)

        # ----------------------------------------------------
        # 4. Temperature vs Anomalies (Predicted on Test Set)
        # ----------------------------------------------------
        plt.figure(figsize=(10, 5))
        plt.plot(test_df.index, test_df['temperature'], label='Test Set Temperature', color='orange')
        plt.scatter(anomalies_df.index, anomalies_df['temperature'], color='red', label='Predicted Anomaly', zorder=5)
        plt.title('4. Temperature vs Predicted Anomalies (Test Set)')
        plt.xlabel('Time (Original Index)')
        plt.ylabel('Temperature')
        plt.legend()
        plt.grid(True)
        plt.show(block=True) 

# ==============================================================================
# ENTRY POINT
# ==============================================================================
if __name__ == "__main__":
    def create_mock_supervised_dataset(n_samples=15000):
        """Creates dummy data mimicking the required format matching 'label' = 1 | -1"""
        print("Generating mock dataset with 'label' column...")
        np.random.seed(42)
        vibration = np.random.normal(0.5, 0.1, n_samples)
        sound = np.random.normal(50, 5, n_samples)
        temperature = np.random.normal(35, 2, n_samples)
        humidity = np.random.normal(40, 5, n_samples)
        
        # Inject anomalies (~5%)
        anomaly_indices = np.random.choice(n_samples, size=int(n_samples*0.05), replace=False)
        vibration[anomaly_indices] += np.random.normal(1.5, 0.5, len(anomaly_indices))
        sound[anomaly_indices] += np.random.normal(25, 5, len(anomaly_indices))
        temperature[anomaly_indices] += np.random.normal(15, 3, len(anomaly_indices))
        
        labels_arr = np.ones(n_samples)
        labels_arr[anomaly_indices] = -1
        
        data = {
            'timestamp': pd.date_range(start='2026-03-10', periods=n_samples, freq='1min'),
            'vibration': vibration,
            'sound': sound,
            'temperature': temperature,
            'humidity': humidity,
            'label': labels_arr
        }
        df = pd.DataFrame(data)
        df.to_csv('supervised_sensor_data.csv', index=False)
        return df

    if os.path.exists('supervised_sensor_data.csv'):
        raw_df = pd.read_csv('supervised_sensor_data.csv')
    else:
        raw_df = create_mock_supervised_dataset()
        
    detector = SupervisedAnomalyDetector(window=10)
    
    # 1. Feature Engineering (Adding rolling window stats, FFTs, rates of change)
    features_df = detector.feature_engineering(raw_df)
    
    # 2. Train and tune models (Random Forest with Grid Search vs Isolation Forest baseline)
    test_set_results, engineered_features_list = detector.train_and_evaluate(features_df)
    
    # 3. Output Four Dedicated Plots (ROC, Feature Importance, Line Series overlays)
    detector.plot_results(test_set_results, engineered_features_list)
